import type { Analise, Ponto } from "./tipos.ts";

const DIA_MS = 86_400_000;

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? (o[m] as number) : ((o[m - 1] as number) + (o[m] as number)) / 2;
}

/** CHT-02 / CHT-03: tendência, volatilidade e spread na janela de `janelaDias`. */
export function analisar(
  pontos: Ponto[],
  janelaDias: number,
  ordens: { menorAnuncio: number | null; maiorOrdem: number | null },
  agora: number,
): Analise | "insuficiente" {
  const corte = agora - janelaDias * DIA_MS;
  const janela = pontos.filter((p) => p.t >= corte).sort((a, b) => a.t - b.t);
  if (janela.length < 3) return "insuficiente";
  const precos = janela.map((p) => p.preco);
  const k = Math.floor(precos.length / 3);
  const primeiro = mediana(precos.slice(0, k));
  const ultimo = mediana(precos.slice(-k));
  const med = mediana(precos);
  if (primeiro <= 0 || med <= 0) return "insuficiente";
  const media = precos.reduce((s, x) => s + x, 0) / precos.length;
  const desvio = Math.sqrt(precos.reduce((s, x) => s + (x - media) ** 2, 0) / precos.length);
  const spread =
    ordens.menorAnuncio !== null && ordens.maiorOrdem !== null ? ordens.menorAnuncio - ordens.maiorOrdem : null;
  return { tendenciaPct: ((ultimo - primeiro) / primeiro) * 100, volatilidade: desvio / med, spread };
}
