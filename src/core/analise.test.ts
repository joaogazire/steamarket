import { describe, expect, it } from "vitest";
import { analisar } from "./analise.ts";
import type { Ponto } from "./tipos.ts";

const DIA = 86_400_000;
const AGORA = 100 * DIA;
const serie = (precos: number[]): Ponto[] =>
  precos.map((preco, i) => ({ t: AGORA - (precos.length - i) * DIA + 1, preco, volume: 1 }));

describe("analisar CHT-02 / CHT-03", () => {
  it("tendência: mediana do último terço contra a do primeiro", () => {
    const r = analisar(serie([100, 100, 100, 200, 200, 200]), 30, { menorAnuncio: 210, maiorOrdem: 190 }, AGORA);
    expect(r).not.toBe("insuficiente");
    if (r === "insuficiente") return;
    expect(r.tendenciaPct).toBeCloseTo(100, 6);
  });
  it("volatilidade: desvio padrão sobre a mediana", () => {
    const r = analisar(serie([100, 100, 100, 200, 200, 200]), 30, { menorAnuncio: 210, maiorOrdem: 190 }, AGORA);
    if (r === "insuficiente") throw new Error("esperava análise");
    expect(r.volatilidade).toBeCloseTo(50 / 150, 6);
  });
  it("spread: menor anúncio menos maior ordem, em centavos", () => {
    const r = analisar(serie([100, 110, 120]), 30, { menorAnuncio: 210, maiorOrdem: 190 }, AGORA);
    if (r === "insuficiente") throw new Error("esperava análise");
    expect(r.spread).toBe(20);
    expect(r.tendenciaPct).toBeCloseTo(20, 6); // 100 -> 120
  });
  it("spread nulo quando falta um dos lados", () => {
    const r = analisar(serie([100, 110, 120]), 30, { menorAnuncio: 210, maiorOrdem: null }, AGORA);
    if (r === "insuficiente") throw new Error("esperava análise");
    expect(r.spread).toBeNull();
  });
  it("menos de 3 pontos na janela dá 'insuficiente'", () => {
    expect(analisar(serie([100, 110]), 30, { menorAnuncio: null, maiorOrdem: null }, AGORA)).toBe("insuficiente");
    expect(analisar([], 30, { menorAnuncio: null, maiorOrdem: null }, AGORA)).toBe("insuficiente");
  });
  it("recorta pela janela de dias", () => {
    // 3 pontos recentes + 5 antigos; janela de 7 dias só vê os recentes
    const antigos: Ponto[] = [1, 2, 3, 4, 5].map((i) => ({ t: AGORA - (40 + i) * DIA, preco: 9999, volume: 1 }));
    const recentes: Ponto[] = [100, 110, 120].map((preco, i) => ({ t: AGORA - (3 - i) * DIA, preco, volume: 1 }));
    const r = analisar([...antigos, ...recentes], 7, { menorAnuncio: null, maiorOrdem: null }, AGORA);
    if (r === "insuficiente") throw new Error("esperava análise");
    expect(r.tendenciaPct).toBeCloseTo(20, 6);
  });
});

describe("analisar: preço zero", () => {
  it("não devolve Infinity/NaN quando a base é zero", () => {
    const pts: Ponto[] = [0, 0, 0].map((preco, i) => ({ t: AGORA - (3 - i) * DIA, preco, volume: 1 }));
    expect(analisar(pts, 30, { menorAnuncio: null, maiorOrdem: null }, AGORA)).toBe("insuficiente");
  });
});
