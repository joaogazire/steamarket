import { describe, expect, it, vi } from "vitest";
import { prepararSerie, renderGrafico } from "./grafico.ts";
import type { Ponto } from "../core/tipos.ts";

const DIA = 86_400_000;
const AGORA = 200 * DIA;
const pts = (n: number): Ponto[] => Array.from({ length: n }, (_, i) => ({ t: AGORA - (n - i) * DIA + 1, preco: 100 + i, volume: 2 }));

describe("prepararSerie CHT-01", () => {
  it("recorta pela janela e separa tempo, preço e volume", () => {
    const [x, preco, vol] = prepararSerie(pts(100), 7, AGORA);
    expect(x).toHaveLength(7);
    expect(preco).toHaveLength(7);
    expect(vol).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(x[0]! < x[6]!).toBe(true);
  });
});

describe("renderGrafico CHT-01 / CHT-02 / CHT-03", () => {
  const ordens = { menorAnuncio: 120, maiorOrdem: 100 };
  it("alternar 7/30/90 redesenha com o recorte certo", () => {
    const el = document.createElement("div");
    const criar = vi.fn(() => ({ destroy: vi.fn() }));
    renderGrafico(el, { pontos: pts(100), ordens, agora: AGORA, criarPlot: criar });
    expect(criar).toHaveBeenLastCalledWith(expect.anything(), expect.arrayContaining([expect.any(Array)]), expect.anything());
    const botao = (d: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === `${d} dias`) as HTMLButtonElement;
    botao("7").click();
    expect((criar.mock.lastCall as unknown as [unknown, unknown[][]])[1][0]).toHaveLength(7);
    botao("90").click();
    expect((criar.mock.lastCall as unknown as [unknown, unknown[][]])[1][0]).toHaveLength(90);
  });
  it("mostra tendência, volatilidade e spread", () => {
    const el = document.createElement("div");
    renderGrafico(el, { pontos: pts(100), ordens, agora: AGORA, criarPlot: () => ({ destroy: vi.fn() }) });
    const t = el.textContent ?? "";
    expect(t).toContain("Tendência");
    expect(t).toContain("Volatilidade");
    expect(t).toContain("Spread");
  });
  it("poucos pontos mostram 'dados insuficientes' e não desenham", () => {
    const el = document.createElement("div");
    const criar = vi.fn(() => ({ destroy: vi.fn() }));
    renderGrafico(el, { pontos: pts(2), ordens, agora: AGORA, criarPlot: criar });
    expect(el.textContent).toContain("dados insuficientes");
    expect(criar).not.toHaveBeenCalled();
  });
});
