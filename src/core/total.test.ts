import { describe, expect, it } from "vitest";
import { reais, somarTotal } from "./total.ts";

describe("somarTotal", () => {
  const menosTreze = (c: number) => Math.floor(c * 0.87);
  it("soma o preço sugerido e o líquido de cada item; sem preço só conta no total de itens", () => {
    expect(somarTotal([100, 250, null], menosTreze)).toEqual({ bruto: 350, liquido: 87 + 217, comPreco: 2, itens: 3 });
  });
  it("lista vazia dá zero", () => {
    expect(somarTotal([], menosTreze)).toEqual({ bruto: 0, liquido: 0, comPreco: 0, itens: 0 });
  });
  it("líquido que falha (preço inválido) entra como zero, sem derrubar o total", () => {
    const r = somarTotal([100, 5], (c) => {
      if (c < 10) throw new Error("abaixo do mínimo");
      return c - 13;
    });
    expect(r).toEqual({ bruto: 105, liquido: 87, comPreco: 2, itens: 2 });
  });
});

describe("reais", () => {
  it("formata centavos com milhar e vírgula", () => {
    expect(reais(5)).toBe("R$ 0,05");
    expect(reais(123456)).toBe("R$ 1.234,56");
    expect(reais(1234567890)).toBe("R$ 12.345.678,90");
  });
});
