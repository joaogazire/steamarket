import { describe, expect, it } from "vitest";
import { REGRA_PADRAO } from "./tipos.ts";
import { liquido } from "./taxas.ts";
import { totalAnunciado, totalSugerido, type LinhaTotal } from "./totais-anuncios.ts";

const L = (preco: number, liq: number | null): LinhaTotal => ({ preco, liquido: liq });

describe("totalAnunciado", () => {
  it("soma o que o comprador paga e o que eu recebo (valor lido da Steam, quando houver)", () => {
    expect(totalAnunciado([L(3500, 3044), L(27, 15)], REGRA_PADRAO)).toEqual({ preco: 3527, liquido: 3059, n: 2 });
  });
  it("sem o líquido lido, calcula pelas taxas", () => {
    expect(totalAnunciado([L(1000, null)], REGRA_PADRAO).liquido).toBe(liquido(1000, REGRA_PADRAO));
  });
  it("preço que a Steam não aceitaria conta 0 de líquido; lista vazia → zeros", () => {
    expect(Number.isFinite(totalAnunciado([L(1, null)], REGRA_PADRAO).liquido)).toBe(true);
    expect(totalAnunciado([], REGRA_PADRAO)).toEqual({ preco: 0, liquido: 0, n: 0 });
  });
});

describe("totalSugerido", () => {
  const regra = REGRA_PADRAO;
  it("soma o preço sugerido e o líquido pelas taxas; itens sem sugestão ficam de fora e contam em faltam", () => {
    const t = totalSugerido([{ sugerido: 100 }, { sugerido: 200 }, { sugerido: null }], regra);
    expect(t.preco).toBe(300);
    expect(t.n).toBe(2);
    expect(t.faltam).toBe(1);
    expect(t.liquido).toBe(liquido(100, regra) + liquido(200, regra));
  });
  it("lista vazia dá zero", () => {
    expect(totalSugerido([], regra)).toEqual({ preco: 0, liquido: 0, n: 0, faltam: 0 });
  });
});
