/** Total dos anúncios ativos: o que o comprador paga e o que cai para o vendedor. */
import { liquido as liquidoDe } from "./taxas.ts";
import type { RegraTaxa } from "./tipos.ts";

export interface LinhaTotal {
  /** o que o comprador paga hoje (centavos) */
  preco: number;
  /** o que o vendedor recebe, lido da Steam; null = calcular pelas taxas */
  liquido: number | null;
}

export interface Total {
  preco: number;
  liquido: number;
  n: number;
}

function liquidoPorTaxas(preco: number, regra: RegraTaxa): number {
  try {
    return liquidoDe(preco, regra);
  } catch {
    return 0; // preço que a Steam não aceitaria
  }
}

export function totalAnunciado(linhas: readonly LinhaTotal[], regra: RegraTaxa): Total {
  let preco = 0;
  let liquido = 0;
  for (const l of linhas) {
    preco += l.preco;
    liquido += l.liquido ?? liquidoPorTaxas(l.preco, regra);
  }
  return { preco, liquido, n: linhas.length };
}

export interface TotalSugerido extends Total {
  /** anúncios ainda sem preço sugerido (sem histórico ou ainda carregando) */
  faltam: number;
}

/** Soma dos preços sugeridos (o que o comprador pagaria) e do que cairia para o vendedor; sem sugestão = fora da soma. */
export function totalSugerido(itens: readonly { sugerido: number | null }[], regra: RegraTaxa): TotalSugerido {
  let preco = 0;
  let liquido = 0;
  let n = 0;
  let faltam = 0;
  for (const i of itens) {
    if (i.sugerido === null) {
      faltam++;
      continue;
    }
    preco += i.sugerido;
    liquido += liquidoPorTaxas(i.sugerido, regra);
    n++;
  }
  return { preco, liquido, n, faltam };
}
