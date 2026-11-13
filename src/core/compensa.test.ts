import { describe, expect, it } from "vitest";
import { LIMITE_NAO_COMPENSA, naoCompensa, taxaEfetiva } from "./compensa.ts";
import type { RegraTaxa } from "./tipos.ts";

const BRL: RegraTaxa = { taxaSteam: 0.05, taxaJogo: 0.1, minimo: 6, incremento: 1 };

describe("taxaEfetiva (BRL, piso de R$ 0,06 por taxa)", () => {
  it("R$ 0,18 rende R$ 0,06: taxa de 67%", () => {
    expect(taxaEfetiva(18, BRL)).toBeCloseTo(0.667, 2);
  });
  it("R$ 0,50 rende R$ 0,38: 24%", () => {
    expect(taxaEfetiva(50, BRL)).toBeCloseTo(0.24, 2);
  });
  it("R$ 1,20 ou mais: taxa mínima (~13%)", () => {
    expect(taxaEfetiva(120, BRL)).toBeCloseTo(0.133, 2);
    expect(taxaEfetiva(1000, BRL)).toBeCloseTo(0.13, 2);
  });
  it("preço abaixo do mínimo da Steam não quebra: conta como 100%", () => {
    expect(taxaEfetiva(5, BRL)).toBe(1);
  });
});

describe("naoCompensa", () => {
  it("abaixo do limite (R$ 0,50) não compensa; no limite ou acima, sim", () => {
    expect(LIMITE_NAO_COMPENSA).toBe(50);
    expect(naoCompensa(49)).toBe(true);
    expect(naoCompensa(50)).toBe(false);
    expect(naoCompensa(300)).toBe(false);
  });
});
