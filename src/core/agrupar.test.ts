import { describe, expect, it } from "vitest";
import { agrupar, ordenarPelaGrade } from "./agrupar.ts";
import type { Ativo } from "./tipos.ts";

const a = (assetid: string, nome: string, marketable = true): Ativo => ({
  assetid, appid: 730, contextid: "2", market_hash_name: nome, marketable,
});

describe("agrupar INV-01 / INV-03", () => {
  it("agrupa por market_hash_name e conta", () => {
    const g = agrupar([a("1", "Caixa X"), a("2", "Faca Y"), a("3", "Caixa X"), a("4", "Caixa X")]);
    expect(g).toHaveLength(2);
    const caixa = g.find((x) => x.nome === "Caixa X");
    expect(caixa?.contagem).toBe(3);
    expect(caixa?.ativos.map((x) => x.assetid)).toEqual(["1", "3", "4"]);
    expect(g.find((x) => x.nome === "Faca Y")?.contagem).toBe(1);
  });
  it("exclui itens não vendáveis", () => {
    const g = agrupar([a("1", "Caixa X"), a("2", "Moeda", false)]);
    expect(g.map((x) => x.nome)).toEqual(["Caixa X"]);
  });
  it("ordena por contagem decrescente e depois por nome", () => {
    const g = agrupar([a("1", "B"), a("2", "A"), a("3", "C"), a("4", "C")]);
    expect(g.map((x) => x.nome)).toEqual(["C", "A", "B"]);
  });
  it("lista vazia dá lista vazia", () => {
    expect(agrupar([])).toEqual([]);
  });
});

describe("ordenarPelaGrade", () => {
  const at = (id: string, nome: string) => ({ assetid: id, appid: 730, contextid: "2", market_hash_name: nome, marketable: true });
  it("ordena os grupos pela posição do primeiro ativo na grade do inventário", () => {
    const ativos = [at("1", "B"), at("2", "A"), at("3", "A"), at("4", "C")];
    const grupos = agrupar(ativos); // A (×2) vem primeiro por contagem
    expect(ordenarPelaGrade(grupos, ativos).map((g) => g.nome)).toEqual(["B", "A", "C"]);
  });
  it("não altera a lista original", () => {
    const ativos = [at("1", "B"), at("2", "A")];
    const grupos = agrupar(ativos);
    const antes = grupos.map((g) => g.nome);
    ordenarPelaGrade(grupos, ativos);
    expect(grupos.map((g) => g.nome)).toEqual(antes);
  });
});
