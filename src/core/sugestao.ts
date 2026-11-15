import { tx } from "./i18n.ts";
import { medianaUltimas } from "./historico.ts";
import type { Ponto } from "./tipos.ts";

export type Modo = "rapido" | "equilibrado" | "paciente";

export interface ContextoSugestao {
  maiorOrdemCompra: number | null;
  menorAnuncio: number | null;
  historico: Ponto[];
}

export interface Sugestao {
  preco: number | null;
  base: string;
}

const valido = (v: number | null): v is number => v !== null && Number.isSafeInteger(v) && v > 0;

/** SUG-03..06. O preço devolvido é o que o comprador paga (centavos). */
export function sugerir(modo: Modo, entrada: ContextoSugestao): Sugestao {
  const ctx = {
    ...entrada,
    maiorOrdemCompra: valido(entrada.maiorOrdemCompra) ? entrada.maiorOrdemCompra : null,
    menorAnuncio: valido(entrada.menorAnuncio) ? entrada.menorAnuncio : null,
  };
  if (modo === "rapido") {
    return ctx.maiorOrdemCompra === null
      ? { preco: null, base: "sem ordens de compra" }
      : { preco: ctx.maiorOrdemCompra, base: "maior ordem de compra" };
  }
  const { preco: mediana, amostra } = medianaUltimas(ctx.historico, 50);
  if (mediana === null) return { preco: ctx.menorAnuncio, base: "sem histórico" };
  const baseMediana = `mediana de ${amostra} vendas`;
  if (modo === "equilibrado") return { preco: mediana, base: baseMediana };
  if (ctx.menorAnuncio !== null && ctx.menorAnuncio > mediana) {
    return { preco: ctx.menorAnuncio, base: "menor anúncio acima da mediana" };
  }
  return { preco: mediana, base: baseMediana };
}

/** Trava do botão de um clique: preço fora de 0,5x a 2x do menor anúncio atual não é listado sem olhar. */
export function foraDoMercado(precoComprador: number, menorAnuncio: number | null): boolean {
  if (menorAnuncio === null || !Number.isSafeInteger(menorAnuncio) || menorAnuncio <= 0) return false;
  return precoComprador < menorAnuncio * 0.5 || precoComprador > menorAnuncio * 2;
}

/** De onde veio o preço: histórico da Steam (mediana), histórico com ajuste acima da mediana (perfil paciente) ou estimativa de terceiros (csgotrader). */
export type FontePreco = "steam" | "estimado" | "ajustado";

/**
 * Trava antes de listar: o preço tem de estar perto do menor anúncio atual da Steam.
 * Sem menor anúncio para comparar, só o preço da mediana da Steam passa; a estimativa de terceiros e o preço ajustado acima da mediana não.
 */
export function motivoParaNaoListar(precoComprador: number, menorAnuncio: number | null, fonte: FontePreco, travar = true): string | null {
  if (!travar) return null; // o usuário desligou a trava no menu do logo
  const temMenor = menorAnuncio !== null && Number.isSafeInteger(menorAnuncio) && menorAnuncio > 0;
  if (!temMenor) return fonte === "steam" ? null : tx().semAnuncioParaConferir;
  return foraDoMercado(precoComprador, menorAnuncio) ? tx().foraDoMercado : null;
}
