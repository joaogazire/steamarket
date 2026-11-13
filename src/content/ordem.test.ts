import { describe, expect, it } from "vitest";
import { chaveDeOrdem, fotografarPrecos, proximoParaRefinar, type EstadoOrdem } from "./ordem.ts";

const estado = (over: Partial<EstadoOrdem> = {}): EstadoOrdem => ({
  ordem: "maior",
  ocultarListados: true,
  ocultarNaoVendaveis: false,
  naoVendaveis: new Set(),
  copias: new Set(),
  listados: new Map(),
  aguardando: new Set(),
  precos: new Map(),
  ...over,
});

describe("fotografarPrecos", () => {
  it("tira a foto do preço de cada quadrado (à venda ou anunciado)", () => {
    const foto = fotografarPrecos(new Map([["a", { preco: 100 }], ["b", { preco: null }]]), new Map([["c", 500], ["d", null]]));
    expect([...foto]).toEqual([["a", 100], ["b", null], ["c", 500], ["d", null]]);
  });
  it("a foto não muda quando o preço do quadrado muda depois (refino da Steam não mexe na ordem)", () => {
    const q = { preco: 100 as number | null };
    const foto = fotografarPrecos(new Map([["a", q]]), new Map());
    q.preco = 999;
    expect(foto.get("a")).toBe(100);
  });
});

describe("chaveDeOrdem", () => {
  it("ordem da Steam: só separa cópias (2) e listados (1) do resto (0)", () => {
    const e = estado({ ordem: "steam", copias: new Set(["c"]), listados: new Map([["l", 10]]) });
    expect(chaveDeOrdem("x", e)).toEqual([0]);
    expect(chaveDeOrdem("l", e)).toEqual([1]);
    expect(chaveDeOrdem("c", e)).toEqual([2]);
  });
  it("Not Marketable vai para o fim só com o filtro ligado", () => {
    const naoVendaveis = new Set(["n"]);
    expect(chaveDeOrdem("n", estado({ ordem: "steam", naoVendaveis }))).toEqual([0]);
    expect(chaveDeOrdem("n", estado({ ordem: "steam", naoVendaveis, ocultarNaoVendaveis: true }))).toEqual([1]);
    expect(chaveDeOrdem("x", estado({ ordem: "steam", naoVendaveis, ocultarNaoVendaveis: true }))).toEqual([0]);
  });
  it("esperando aprovação fica no lugar; sem ocultar, listado também", () => {
    expect(chaveDeOrdem("l", estado({ ordem: "steam", listados: new Map([["l", 10]]), aguardando: new Set(["l"]) }))).toEqual([0]);
    expect(chaveDeOrdem("l", estado({ ordem: "steam", ocultarListados: false, listados: new Map([["l", 10]]) }))).toEqual([0]);
  });
  it("por preço usa a foto: maior primeiro (negativo), menor primeiro, sem preço depois", () => {
    const precos = new Map<string, number | null>([["a", 300], ["b", null]]);
    expect(chaveDeOrdem("a", estado({ precos }))).toEqual([0, 0, -300]);
    expect(chaveDeOrdem("a", estado({ precos, ordem: "menor" }))).toEqual([0, 0, 300]);
    expect(chaveDeOrdem("b", estado({ precos }))).toEqual([0, 1, 0]);
    expect(chaveDeOrdem("fora-da-foto", estado({ precos }))).toEqual([0, 1, 0]);
  });
});

describe("chaveDeOrdem: só bons negócios", () => {
  it("com o filtro, quem não é bom vai para o fim (1); os bons ficam (0)", () => {
    const e = estado({ ordem: "steam", apenasBons: true, bons: new Set(["a"]) });
    expect(chaveDeOrdem("a", e)).toEqual([0]);
    expect(chaveDeOrdem("b", e)).toEqual([1]);
  });
  it("sem o filtro, ninguém é afetado", () => {
    expect(chaveDeOrdem("b", estado({ ordem: "steam", bons: new Set(["a"]) }))).toEqual([0]);
  });
});

describe("chaveDeOrdem: itens que não compensam", () => {
  it("com o filtro, vão para o fim; sem o filtro, ninguém é afetado", () => {
    const baratos = new Set(["a"]);
    expect(chaveDeOrdem("a", estado({ ordem: "steam", ocultarBaratos: true, baratos }))).toEqual([1]);
    expect(chaveDeOrdem("b", estado({ ordem: "steam", ocultarBaratos: true, baratos }))).toEqual([0]);
    expect(chaveDeOrdem("a", estado({ ordem: "steam", baratos }))).toEqual([0]);
  });
});

describe("proximoParaRefinar", () => {
  const g = (nome: string) => ({ nome });
  it("pula quem já foi pedido; o preço rápido (tabela em USD) não dispensa o histórico em BRL", () => {
    const grupos = [g("a"), g("b"), g("c")];
    expect(proximoParaRefinar(grupos, new Set(["a", "b"]))?.nome).toBe("c");
    expect(proximoParaRefinar(grupos, new Set())?.nome).toBe("a");
  });
  it("sem nada a refinar, devolve undefined", () => {
    expect(proximoParaRefinar([g("a")], new Set(["a"]))).toBeUndefined();
  });
});
