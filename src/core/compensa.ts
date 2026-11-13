/**
 * Taxa da Steam em itens baratos. Em BRL cada taxa (5% e 10%) tem piso de R$ 0,06, então R$ 0,18 rende R$ 0,06
 * (taxa de 67%); a taxa só cai para o piso de ~13% a partir de ~R$ 1,20. Ver .specs/features/analise-venda/spec.md.
 */
import { liquido } from "./taxas.ts";
import type { RegraTaxa } from "./tipos.ts";

/** Abaixo disto (centavos, BRL) a taxa passa de ~24%: "não compensa vender agora". */
export const LIMITE_NAO_COMPENSA = 50;
/** A partir deste preço (centavos, BRL) a taxa já está no piso (~13%); o ideal seria vender só acima dele. */
export const PRECO_TAXA_MINIMA = 120;

/** Fração do preço que a Steam fica (0 a 1); preço que a Steam não aceita conta como 1. */
export function taxaEfetiva(preco: number, regra: RegraTaxa): number {
  try {
    return 1 - liquido(preco, regra) / preco;
  } catch {
    return 1;
  }
}

export const naoCompensa = (preco: number): boolean => preco < LIMITE_NAO_COMPENSA;
