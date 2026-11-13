/**
 * Preço sugerido do perfil "paciente": quem aceita esperar um tempo médio (poucos dias) por um preço melhor,
 * sem apostar em picos nem vender na pressa. Regras AV-09..AV-12 em .specs/features/analise-venda/spec.md.
 */
import { LIMITE_NAO_COMPENSA } from "./compensa.ts";
import { medianaUltimas } from "./historico.ts";
import { avaliarMomento } from "./momento-venda.ts";
import type { Ponto } from "./tipos.ts";

const DIA = 86_400_000;
const MIN_VENDAS = 10;
const AMOSTRA_ALVO = 150;

/** Perfil de venda: quanto esperar por um preço melhor. */
export type Perfil = "rapido" | "medio" | "paciente";
export const PERFIS: readonly Perfil[] = ["rapido", "medio", "paciente"];
/** `qMax`: percentil máximo das vendas recentes; `teto`: múltiplo máximo da mediana. */
const REGRAS: Record<Perfil, { qMax: number; teto: number }> = {
  rapido: { qMax: 0.5, teto: 1 },
  medio: { qMax: 0.7, teto: 1.2 },
  paciente: { qMax: 0.8, teto: 1.3 },
};
/** Item barato (taxa alta): só o paciente mira mais alto para fugir do piso de taxa da Steam. */
const REGRAS_BARATO: Partial<Record<Perfil, { qMax: number; teto: number }>> = { paciente: { qMax: 0.9, teto: 1.5 } };
export const PERFIL_PADRAO: Perfil = "paciente";
/** Valor salvo (storage) → perfil válido; qualquer outra coisa volta ao padrão. */
export const lerPerfil = (v: unknown): Perfil => (v === "rapido" || v === "medio" || v === "paciente" ? v : PERFIL_PADRAO);

export interface PrecoPaciente {
  /** centavos (o que o comprador paga) */
  preco: number;
  /** percentil usado (0,5 = mediana) */
  q: number;
  /** vendas por dia na janela */
  porDia: number;
  base: string;
}

/** Percentil `q` ponderado pelo volume (primeiro preço em que o peso acumulado alcança q do total). */
function percentil(pontos: { preco: number; volume: number }[], q: number): number {
  const ordenados = [...pontos].sort((a, b) => a.preco - b.preco);
  const total = ordenados.reduce((s, p) => s + p.volume, 0);
  let acumulado = 0;
  for (const p of ordenados) {
    acumulado += p.volume;
    if (acumulado >= total * q) return p.preco;
  }
  return (ordenados[ordenados.length - 1] as { preco: number }).preco;
}

export function precoPaciente(historico: Ponto[], agora: number, perfil: Perfil = PERFIL_PADRAO): PrecoPaciente | null {
  const janela = (dias: number) => historico.filter((p) => p.volume > 0 && p.t > agora - dias * DIA && p.t <= agora + DIA);
  // Janela adaptativa: a menor (2 a 14 dias) que junta ~150 vendas; item muito vendido usa dias recentes
  // (preço que acompanha o mercado agora), item parado usa 14 dias.
  let dias = 14;
  for (let d = 2; d < 14; d++) {
    if (janela(d).reduce((s, p) => s + p.volume, 0) >= AMOSTRA_ALVO) {
      dias = d;
      break;
    }
  }
  let w = janela(dias);
  if (w.reduce((s, p) => s + p.volume, 0) < MIN_VENDAS) {
    dias = 30;
    w = janela(dias);
  }
  const vendas = w.reduce((s, p) => s + p.volume, 0);
  if (vendas < MIN_VENDAS) {
    const m = medianaUltimas(historico, 50);
    return m.preco === null ? null : { preco: m.preco, q: 0.5, porDia: 0, base: `mediana de ${m.amostra} vendas` };
  }
  const porDia = vendas / dias;
  const emQueda = avaliarMomento(historico, agora)?.motivos.some((m) => m.tipo === "queda") ?? false;
  
  const mediana = percentil(w, 0.5);
  const { qMax, teto } = (mediana < LIMITE_NAO_COMPENSA ? REGRAS_BARATO[perfil] : undefined) ?? REGRAS[perfil];
  const q = emQueda ? 0.5 : Math.min(qMax, Math.max(0.5, 1 - 2 / porDia));
  const preco = Math.min(percentil(w, q), Math.round(mediana * teto));
  return { preco: Math.max(preco, mediana), q, porDia, base: `percentil ${Math.round(q * 100)} de ${vendas} vendas em ${dias} dias` };
}
