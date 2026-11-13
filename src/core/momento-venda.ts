/**
 * Análise de venda: lê o histórico de preços de um item e diz se vender agora tende a valer mais que esperar.
 * É uma heurística (queda de tendência, pico, platô, efeito Major confirmado no próprio item), não uma previsão
 * garantida. Regras em .specs/features/analise-venda/spec.md.
 */
import { tx } from "./i18n.ts";
import { MAJORS, type Major } from "./majors.ts";
import type { Ponto } from "./tipos.ts";

const DIA = 86_400_000;
const MIN_DIAS = 45;
const MIN_PRECO = 25; // centavos
const LIMITE_BOM = 50;

export type Motivo =
  | { tipo: "queda"; pct: number }
  | { tipo: "pico"; acimaPct: number }
  | { tipo: "plato"; altaPct: number }
  | { tipo: "major"; dias: number; caiu: number; de: number };

export interface Veredito {
  /** soma dos sinais (pode ser negativa) */
  pontos: number;
  bom: boolean;
  motivos: Motivo[];
}

interface Dia {
  /** dia UTC (ms desde 1970 / DIA, inteiro) */
  dia: number;
  preco: number;
  volume: number;
}

const mediana = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Um preço por dia (mediana dos pontos do dia) e o volume somado. */
function diarios(historico: Ponto[]): Dia[] {
  const porDia = new Map<number, Ponto[]>();
  for (const p of historico) {
    const d = Math.floor(p.t / DIA);
    const dia = porDia.get(d);
    if (dia) dia.push(p);
    else porDia.set(d, [p]);
  }
  return [...porDia]
    .sort((a, b) => a[0] - b[0])
    .map(([dia, ps]) => ({ dia, preco: mediana(ps.map((p) => p.preco)) as number, volume: ps.reduce((s, p) => s + p.volume, 0) }));
}

export function avaliarMomento(historico: Ponto[], agora: number, majors: readonly Major[] = MAJORS): Veredito | null {
  const dias = diarios(historico);
  const hoje = Math.floor(agora / DIA);
  const atras = (d: Dia) => hoje - d.dia;
  /** preços dos dias entre `a` (inclusive) e `b` (exclusive) dias atrás; null se houver poucos */
  const janela = (a: number, b: number, minimo = 4): Dia[] | null => {
    const w = dias.filter((d) => atras(d) >= a && atras(d) < b);
    return w.length >= minimo ? w : null;
  };
  const med = (a: number, b: number, minimo = 4): number | null => {
    const w = janela(a, b, minimo);
    return w ? mediana(w.map((d) => d.preco)) : null;
  };

  const primeiro = dias[0];
  if (!primeiro || hoje - primeiro.dia < MIN_DIAS) return null;
  const p7 = med(0, 7, 1);
  if (p7 === null || p7 < MIN_PRECO) return null;
  const p30 = med(0, 30);

  const motivos: Motivo[] = [];
  let pontos = 0;

  // AV-02: queda de tendência
  const p60 = med(53, 68);
  let emQueda = false;
  if (p60 !== null && p30 !== null && p7 / p60 <= 0.85 && p7 <= p30) {
    const r = p7 / p60;
    pontos += r <= 0.7 ? 55 : 35;
    motivos.push({ tipo: "queda", pct: Math.round((1 - r) * 100) });
    emQueda = true;
  }

  // AV-03: pico
  const w180 = janela(0, 180, 40);
  const p90 = med(0, 90, 20);
  let noPico = false;
  if (w180 && p90 !== null) {
    const ordenados = w180.map((d) => d.preco).sort((a, b) => a - b);
    const p80 = ordenados[Math.floor(ordenados.length * 0.8)] as number;
    const r = p7 / p90;
    if (p7 >= p80 && r >= 1.15) {
      pontos += r >= 1.3 ? 55 : 40;
      motivos.push({ tipo: "pico", acimaPct: Math.round((r - 1) * 100) });
      noPico = true;
    }
    // AV-06: em alta forte sem ser pico nem platô
    if (p30 !== null && p7 / p30 >= 1.1 && !noPico) pontos -= 15;
  }
  // AV-06: depois de uma queda, o preço já saiu do fundo (até 25% acima do menor dos 30 dias): rebote, esperar não perde
  const w30 = janela(0, 30, 10);
  if (w30 && emQueda) {
    const minimo = Math.min(...w30.map((d) => d.preco));
    if (p7 >= minimo * 1.05 && p7 <= minimo * 1.25) pontos -= 30;
  }

  // AV-04: platô
  const pAnt = med(60, 90);
  const p7b = med(7, 14, 1);
  if (pAnt !== null && p30 !== null && p7b !== null && p30 / pAnt >= 1.12 && Math.abs(p7 / p7b - 1) <= 0.03) {
    pontos += 35;
    const v1 = janela(0, 14, 1)?.reduce((s, d) => s + d.volume, 0) ?? 0;
    const v0 = janela(14, 28, 1)?.reduce((s, d) => s + d.volume, 0) ?? 0;
    if (v0 > 0 && v1 <= v0 * 0.8) pontos += 10;
    motivos.push({ tipo: "plato", altaPct: Math.round((p30 / pAnt - 1) * 100) });
  }

  // AV-05: Major confirmado pelo próprio item
  const dia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DIA);
  const proximo = majors.find((m) => dia(m.fim) >= hoje && dia(m.inicio) <= hoje + 45);
  if (proximo) {
    let caiu = 0;
    let de = 0;
    for (const m of majors) {
      const ini = dia(m.inicio);
      if (ini + 21 > hoje || m === proximo) continue;
      const antes = dias.filter((d) => d.dia >= ini - 30 && d.dia < ini);
      const durante = dias.filter((d) => d.dia >= ini && d.dia <= ini + 21);
      if (antes.length < 5 || durante.length < 5) continue;
      de++;
      const r = (mediana(durante.map((d) => d.preco)) as number) / (mediana(antes.map((d) => d.preco)) as number);
      if (r < 0.97) caiu++;
    }
    if (de >= 2 && caiu / de >= 0.6) {
      pontos += 25;
      motivos.push({ tipo: "major", dias: Math.max(0, dia(proximo.inicio) - hoje), caiu, de });
    }
  }

  return { pontos, bom: pontos >= LIMITE_BOM, motivos };
}

/** Dica do item: um motivo por linha e o aviso de que é estimativa. */
export function descreverMotivos(motivos: readonly Motivo[]): string {
  const t = tx();
  const linhas = motivos.map((m) =>
    m.tipo === "queda" ? t.motivoQueda(m.pct)
    : m.tipo === "pico" ? t.motivoPico(m.acimaPct)
    : m.tipo === "plato" ? t.motivoPlato(m.altaPct)
    : t.motivoMajor(m.dias, m.caiu, m.de),
  );
  return [t.bomNegocioTitulo, ...linhas.map((l) => `• ${l}`)].join("\n");
}
