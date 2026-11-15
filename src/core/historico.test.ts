import { describe, expect, it } from "vitest";
import { mediaUltimasVendas, medianaUltimas, parseHistorico } from "./historico.ts";
import type { Ponto } from "./tipos.ts";

const p = (t: number, preco: number, volume: number): Ponto => ({ t, preco, volume });

describe("parseHistorico", () => {
  it("converte data, preço em centavos e volume", () => {
    const r = parseHistorico({ success: true, prices: [["Nov 10 2026 01: +0", 12.34, "45"]] });
    expect(r).toEqual([{ t: Date.UTC(2026, 10, 10, 1), preco: 1234, volume: 45 }]);
  });
  it("lança erro se o formato não é o esperado", () => {
    expect(() => parseHistorico({ success: true })).toThrow("pricehistory");
    expect(() => parseHistorico({ success: true, prices: [["data ruim", 1, "1"]] })).toThrow("pricehistory");
  });
  it("ordena do mais antigo para o mais novo", () => {
    const r = parseHistorico({ success: true, prices: [["Nov 10 2026 02: +0", 2, "1"], ["Nov 10 2026 01: +0", 1, "1"]] });
    expect(r.map((x) => x.preco)).toEqual([100, 200]);
  });
});

describe("medianaUltimas SUG-01 / SUG-02", () => {
  it("usa só uma parte do ponto de corte até somar 50 unidades", () => {
    // mais novo primeiro: t3 (300 x40) pesa 40; t2 (200 x30) entra com só 10
    const r = medianaUltimas([p(1, 100, 10), p(2, 200, 30), p(3, 300, 40)], 50);
    expect(r).toEqual({ preco: 300, amostra: 50 });
  });
  it("um ponto maior que 50 sozinho define a mediana", () => {
    expect(medianaUltimas([p(1, 100, 10), p(4, 400, 60)], 50)).toEqual({ preco: 400, amostra: 50 });
  });
  it("com menos de 50 usa todas e informa a amostra real", () => {
    // pesos 5,5,10; metade = 10; acumulado 5, 10 -> preço 200 (mediana inferior)
    const r = medianaUltimas([p(1, 100, 5), p(2, 200, 5), p(3, 300, 10)], 50);
    expect(r).toEqual({ preco: 200, amostra: 20 });
  });
  it("sem pontos devolve preço nulo e amostra 0", () => {
    expect(medianaUltimas([], 50)).toEqual({ preco: null, amostra: 0 });
  });
  it("ignora pontos de volume 0", () => {
    expect(medianaUltimas([p(1, 100, 0), p(2, 500, 3)], 50)).toEqual({ preco: 500, amostra: 3 });
  });
  it("não depende da ordem de entrada", () => {
    const r = medianaUltimas([p(3, 300, 40), p(1, 100, 10), p(2, 200, 30)], 50);
    expect(r).toEqual({ preco: 300, amostra: 50 });
  });
});

describe("parseHistorico: entrada hostil", () => {
  it("recusa preço zero, negativo ou gigante", () => {
    expect(() => parseHistorico({ prices: [["Nov 10 2026 01: +0", 0, "1"]] })).toThrow("preço");
    expect(() => parseHistorico({ prices: [["Nov 10 2026 01: +0", -3, "1"]] })).toThrow("preço");
    expect(() => parseHistorico({ prices: [["Nov 10 2026 01: +0", 1e308, "1"]] })).toThrow("preço");
  });
  it("recusa data impossível", () => {
    expect(() => parseHistorico({ prices: [["Feb 31 2026 01: +0", 1, "1"]] })).toThrow("data");
    expect(() => parseHistorico({ prices: [["Nov 10 2026 99: +0", 1, "1"]] })).toThrow("data");
  });
  it("recusa histórico com mais de 100000 linhas", () => {
    const linhas = Array.from({ length: 100_001 }, () => ["Nov 10 2026 01: +0", 1, "1"]);
    expect(() => parseHistorico({ prices: linhas })).toThrow("grande demais");
  });
});

describe("mediaUltimasVendas (média das últimas 5 vendas do último dia)", () => {
  const H = 3_600_000;
  const AGORA = Date.UTC(2026, 10, 14, 12);
  it("média ponderada pelas 5 vendas mais recentes; só entra a parte do ponto que falta para fechar 5", () => {
    const h = [p(AGORA - 5 * H, 100, 10), p(AGORA - 2 * H, 200, 2), p(AGORA - 1 * H, 300, 4)];
    // mais recentes: 4×300 + 1×200 = 1400 / 5 = 280
    expect(mediaUltimasVendas(h, AGORA)).toEqual({ preco: 280, amostra: 5 });
  });
  it("ignora vendas com mais de 24 h", () => {
    const h = [p(AGORA - 30 * H, 999, 50), p(AGORA - 3 * H, 100, 1), p(AGORA - 2 * H, 200, 1)];
    expect(mediaUltimasVendas(h, AGORA)).toEqual({ preco: 150, amostra: 2 });
  });
  it("menos de 5 vendas no dia: usa as que houver e diz quantas", () => {
    expect(mediaUltimasVendas([p(AGORA - H, 101, 1)], AGORA)).toEqual({ preco: 101, amostra: 1 });
  });
  it("sem venda no último dia → null; volume 0 não conta", () => {
    expect(mediaUltimasVendas([p(AGORA - 48 * H, 100, 5)], AGORA)).toBeNull();
    expect(mediaUltimasVendas([p(AGORA - H, 100, 0)], AGORA)).toBeNull();
    expect(mediaUltimasVendas([], AGORA)).toBeNull();
  });
});
