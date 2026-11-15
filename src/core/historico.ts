import type { Ponto } from "./tipos.ts";

const MAX_LINHAS = 100_000;
const MAX_PRECO = 1_000_000_000;
const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function erro(detalhe: string): Error {
  return new Error(`pricehistory: ${detalhe}`);
}

function parseData(s: string): number {
  // formato da Steam: "Nov 10 2026 01: +0"
  const m = /^([A-Z][a-z]{2}) (\d{1,2}) (\d{4}) (\d{1,2}): \+0$/.exec(s);
  const mes = m ? MESES.indexOf(m[1] as string) : -1;
  if (!m || mes < 0) throw erro(`data inesperada "${s}"`);
  const [ano, dia, hora] = [Number(m[3]), Number(m[2]), Number(m[4])];
  const t = Date.UTC(ano, mes, dia, hora);
  const d = new Date(t);
  if (hora > 23 || d.getUTCMonth() !== mes || d.getUTCDate() !== dia) throw erro(`data inválida "${s}"`);
  return t;
}

/** Lê a resposta de /market/pricehistory. Preço vira centavos; ordena do mais antigo ao mais novo. */
export function parseHistorico(raw: unknown): Ponto[] {
  const prices = (raw as { prices?: unknown } | null)?.prices;
  if (!Array.isArray(prices)) throw erro("campo prices ausente");
  if (prices.length > MAX_LINHAS) throw erro("histórico grande demais");
  const pontos = prices.map((linha): Ponto => {
    if (!Array.isArray(linha) || typeof linha[0] !== "string" || typeof linha[1] !== "number") {
      throw erro("linha inesperada");
    }
    const volume = Number.parseInt(String(linha[2]), 10);
    if (!Number.isFinite(volume)) throw erro("volume inesperado");
    const preco = Math.round(linha[1] * 100);
    if (!Number.isSafeInteger(preco) || preco <= 0 || preco > MAX_PRECO) throw erro("preço inválido");
    return { t: parseData(linha[0]), preco, volume };
  });
  return pontos.sort((a, b) => a.t - b.t);
}

/**
 * SUG-01 / SUG-02: mediana ponderada pelo volume das vendas mais recentes, até somar `n` unidades.
 * Só entra a parte do último ponto que falta para fechar `n`. Mediana inferior: primeiro preço
 * em que o peso acumulado (do mais barato ao mais caro) alcança metade do total.
 */
export function medianaUltimas(pontos: Ponto[], n = 50): { preco: number | null; amostra: number } {
  const recentes = [...pontos].sort((a, b) => b.t - a.t);
  const pesos: { preco: number; peso: number }[] = [];
  let falta = n;
  for (const p of recentes) {
    if (falta <= 0) break;
    if (p.volume <= 0) continue;
    const peso = Math.min(p.volume, falta);
    pesos.push({ preco: p.preco, peso });
    falta -= peso;
  }
  const amostra = n - falta;
  if (amostra === 0) return { preco: null, amostra: 0 };
  pesos.sort((a, b) => a.preco - b.preco);
  let acumulado = 0;
  for (const { preco, peso } of pesos) {
    acumulado += peso;
    if (acumulado >= amostra / 2) return { preco, amostra };
  }
  return { preco: null, amostra };
}

/**
 * Média (ponderada pelo volume) das últimas `n` vendas dentro de `janelaMs` (padrão: 1 dia, 5 vendas).
 * Com menos de `n` vendas na janela usa as que houver; sem nenhuma, null.
 */
export function mediaUltimasVendas(pontos: Ponto[], agora: number, n = 5, janelaMs = 86_400_000): { preco: number; amostra: number } | null {
  const recentes = pontos.filter((p) => p.volume > 0 && p.t > agora - janelaMs && p.t <= agora + 3_600_000).sort((a, b) => b.t - a.t);
  let falta = n;
  let soma = 0;
  for (const p of recentes) {
    if (falta <= 0) break;
    const peso = Math.min(p.volume, falta);
    soma += p.preco * peso;
    falta -= peso;
  }
  const amostra = n - falta;
  return amostra === 0 ? null : { preco: Math.round(soma / amostra), amostra };
}
