import { describe, expect, it } from "vitest";
import { lerDataListagem, ordenarAnuncios } from "./ordem-anuncios.ts";

const AGORA = Date.UTC(2026, 10, 14, 12); // 14/11/2026

describe("lerDataListagem (a Steam mostra só dia e mês: '14 Nov', '4 Aug')", () => {
  it("assume o ano atual; data no futuro pertence ao ano anterior", () => {
    expect(lerDataListagem("14 Nov", AGORA)).toBe(Date.UTC(2026, 10, 14));
    expect(lerDataListagem("4 Aug", AGORA)).toBe(Date.UTC(2026, 7, 4));
    expect(lerDataListagem("20 Dec", AGORA)).toBe(Date.UTC(2025, 11, 20));
  });
  it("aceita com ano, espaços extras e meses em português", () => {
    expect(lerDataListagem("  4 Aug 2024 ", AGORA)).toBe(Date.UTC(2024, 7, 4));
    expect(lerDataListagem("4 ago", AGORA)).toBe(Date.UTC(2026, 7, 4));
  });
  it("texto que não é data → null", () => {
    expect(lerDataListagem("", AGORA)).toBeNull();
    expect(lerDataListagem("ontem", AGORA)).toBeNull();
    expect(lerDataListagem("31 Feb", AGORA)).toBeNull();
  });
});

describe("ordenarAnuncios", () => {
  const itens = [{ n: "a", v: 30 as number | null }, { n: "b", v: 10 }, { n: "c", v: null }, { n: "d", v: 10 }, { n: "e", v: 20 }];
  const nomes = (r: typeof itens) => r.map((x) => x.n).join("");
  it("crescente: menor primeiro, empate mantém a ordem original, sem valor por último", () => {
    expect(nomes(ordenarAnuncios(itens, (x) => x.v, "asc"))).toBe("bdeac");
  });
  it("decrescente: maior primeiro, empate mantém a ordem original, sem valor continua por último", () => {
    expect(nomes(ordenarAnuncios(itens, (x) => x.v, "desc"))).toBe("aebdc");
  });
  it("não altera a lista de entrada", () => {
    const antes = nomes(itens);
    ordenarAnuncios(itens, (x) => x.v, "asc");
    expect(nomes(itens)).toBe(antes);
  });
});
