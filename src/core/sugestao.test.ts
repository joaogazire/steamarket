import { describe, expect, it } from "vitest";
import { sugerir } from "./sugestao.ts";
import type { Ponto } from "./tipos.ts";

const hist: Ponto[] = [
  { t: 1, preco: 200, volume: 10 },
  { t: 2, preco: 300, volume: 40 },
]; // 50 unidades, mediana 300

describe("sugerir SUG-03..06", () => {
  const ctx = { maiorOrdemCompra: 250, menorAnuncio: 320, historico: hist };

  it("rápido: maior ordem de compra", () => {
    expect(sugerir("rapido", ctx)).toEqual({ preco: 250, base: "maior ordem de compra" });
  });
  it("equilibrado: mediana das últimas vendas", () => {
    expect(sugerir("equilibrado", ctx)).toEqual({ preco: 300, base: "mediana de 50 vendas" });
  });
  it("paciente: o maior entre a mediana e o menor anúncio", () => {
    expect(sugerir("paciente", ctx)).toEqual({ preco: 320, base: "menor anúncio acima da mediana" });
    expect(sugerir("paciente", { ...ctx, menorAnuncio: 280 })).toEqual({ preco: 300, base: "mediana de 50 vendas" });
  });
  it("com menos de 50 vendas mostra 'N vendas'", () => {
    const r = sugerir("equilibrado", { ...ctx, historico: [{ t: 1, preco: 200, volume: 7 }] });
    expect(r).toEqual({ preco: 200, base: "mediana de 7 vendas" });
  });
  it("sem histórico sugere o menor anúncio e indica 'sem histórico'", () => {
    const c = { ...ctx, historico: [] };
    expect(sugerir("equilibrado", c)).toEqual({ preco: 320, base: "sem histórico" });
    expect(sugerir("paciente", c)).toEqual({ preco: 320, base: "sem histórico" });
  });
  it("sem ordens de compra o rápido não inventa preço", () => {
    expect(sugerir("rapido", { ...ctx, maiorOrdemCompra: null })).toEqual({ preco: null, base: "sem ordens de compra" });
  });
});

describe("sugerir: preços inválidos da Steam", () => {
  it("ignora ordem/anúncio não positivos ou não inteiros", () => {
    const c = { maiorOrdemCompra: 0, menorAnuncio: -1, historico: [] as Ponto[] };
    expect(sugerir("rapido", c)).toEqual({ preco: null, base: "sem ordens de compra" });
    expect(sugerir("equilibrado", c)).toEqual({ preco: null, base: "sem histórico" });
    expect(sugerir("rapido", { ...c, maiorOrdemCompra: 2.5 }).preco).toBeNull();
  });
});
