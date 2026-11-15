import { describe, expect, it } from "vitest";
import { formatarVariacao, variacaoPct } from "./variacao.ts";

describe("variacaoPct (do preço anunciado para a média das últimas vendas)", () => {
  it("(ultimas − preço) / preço, em %", () => {
    expect(variacaoPct(100, 112)).toBeCloseTo(12);
    expect(variacaoPct(3500, 1354)).toBeCloseTo(-61.31, 1);
    expect(variacaoPct(27, 17)).toBeCloseTo(-37.04, 1);
  });
  it("sem um dos valores, ou preço zero → null", () => {
    expect(variacaoPct(0, 10)).toBeNull();
    expect(variacaoPct(10, null)).toBeNull();
    expect(variacaoPct(null, 10)).toBeNull();
  });
});

describe("formatarVariacao", () => {
  it("sinal explícito e vírgula decimal; uma casa abaixo de 10%, inteiro de 10% para cima", () => {
    expect(formatarVariacao(12.4)).toBe("+12%");
    expect(formatarVariacao(-37.04)).toBe("−37%");
    expect(formatarVariacao(4.46)).toBe("+4,5%");
    expect(formatarVariacao(-0.84)).toBe("−0,8%");
  });
  it("praticamente zero vira 0%", () => {
    expect(formatarVariacao(0)).toBe("0%");
    expect(formatarVariacao(0.04)).toBe("0%");
  });
  it("milhar acima de 999 usa ponto", () => {
    expect(formatarVariacao(1234.5)).toBe("+1.235%");
  });
});
