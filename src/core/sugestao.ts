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
