import { describe, expect, it } from "vitest";
import { avaliarMomento, descreverMotivos } from "./momento-venda.ts";
import { definirIdioma } from "./i18n.ts";
import type { Major } from "./majors.ts";
import type { Ponto } from "./tipos.ts";

const DIA = 86_400_000;
const AGORA = Date.UTC(2026, 10, 13, 12);

/** Série diária terminando hoje: `f(diasAtras)` devolve o preço em reais; `n` dias de histórico. */
function serie(n: number, f: (atras: number) => number, volume = 100): Ponto[] {
  const p: Ponto[] = [];
  for (let atras = n - 1; atras >= 0; atras--) p.push({ t: AGORA - atras * DIA, preco: Math.round(f(atras) * 100), volume });
  return p;
}
const tipos = (h: Ponto[], majors: readonly Major[] = []) => avaliarMomento(h, AGORA, majors)?.motivos.map((m) => m.tipo) ?? [];
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

describe("avaliarMomento: sem dados suficientes", () => {
  it("menos de 45 dias → null", () => {
    expect(avaliarMomento(serie(30, () => 5), AGORA, [])).toBeNull();
  });
  it("preço atual abaixo de R$ 0,25 → null (ruído de centavos)", () => {
    expect(avaliarMomento(serie(200, () => 0.2), AGORA, [])).toBeNull();
  });
  it("preço estável: sem motivos e não é bom negócio", () => {
    const v = avaliarMomento(serie(200, () => 5), AGORA, [])!;
    expect(v.motivos).toEqual([]);
    expect(v.bom).toBe(false);
  });
});

describe("avaliarMomento: queda (AV-02)", () => {
  it("caiu 40% em 60 dias e segue caindo → motivo queda e bom negócio", () => {
    const h = serie(200, (a) => (a >= 60 ? 10 : 6 + (a / 60) * 4)); // 10 até 60 dias atrás, depois desce até 6
    const v = avaliarMomento(h, AGORA, [])!;
    expect(v.motivos.map((m) => m.tipo)).toContain("queda");
    expect(v.bom).toBe(true);
  });
  it("queda leve (10%) não conta", () => {
    expect(tipos(serie(200, (a) => (a >= 60 ? 10 : 9 + (a / 60))))).not.toContain("queda");
  });
});

describe("avaliarMomento: pico (AV-03)", () => {
  it("preço 60% acima do normal, no topo de 6 meses → pico e bom negócio", () => {
    const h = serie(200, (a) => (a >= 5 ? 5 : 8));
    const v = avaliarMomento(h, AGORA, [])!;
    expect(v.motivos.map((m) => m.tipo)).toContain("pico");
    expect(v.bom).toBe(true);
  });
});

describe("avaliarMomento: platô (AV-04)", () => {
  it("subiu e estagnou nas últimas 2 semanas → platô", () => {
    const h = serie(200, (a) => (a >= 70 ? 5 : a >= 30 ? 5 + ((70 - a) / 40) * 2 : 7));
    expect(tipos(h)).toContain("plato");
  });
  it("ainda subindo forte não é platô", () => {
    const h = serie(200, (a) => (a >= 70 ? 5 : 5 + ((70 - a) / 70) * 3));
    expect(tipos(h)).not.toContain("plato");
  });
});

describe("avaliarMomento: contra-sinal (AV-06)", () => {
  it("no fundo e já subindo: não é bom negócio mesmo depois de uma queda", () => {
    const h = serie(200, (a) => (a >= 70 ? 10 : a >= 10 ? 4 + ((a - 10) / 60) * 6 : 4.5)); // caiu até 4 e voltou a 4,5
    const v = avaliarMomento(h, AGORA, [])!;
    expect(v.bom).toBe(false);
  });
});

describe("avaliarMomento: Major (AV-05)", () => {
  const maj = (inicio: number, dur = 14): Major => ({ nome: iso(inicio), inicio: iso(inicio), fim: iso(inicio + dur * DIA) });
  // três Majors passados (cada um 150, 300 e 450 dias atrás) e um daqui a 12 dias
  const passados = [150, 300, 450].map((d) => maj(AGORA - d * DIA));
  const proximo = maj(AGORA + 12 * DIA);
  const comQueda = (a: number) => (passados.some((m) => Date.parse(m.inicio) <= AGORA - a * DIA && AGORA - a * DIA <= Date.parse(m.inicio) + 21 * DIA) ? 8 : 10);

  it("o item caiu em todos os Majors passados e o próximo está perto → motivo major (soma, mas sozinho não basta)", () => {
    const v = avaliarMomento(serie(500, comQueda), AGORA, [...passados, proximo])!;
    const m = v.motivos.find((x) => x.tipo === "major");
    expect(m).toMatchObject({ tipo: "major", dias: 12, caiu: 3, de: 3 });
    expect(v.bom).toBe(false); // só o Major (25 pts) não chega a 50
  });
  it("o item NÃO caiu nos Majors passados → o mito não conta", () => {
    expect(tipos(serie(500, () => 10), [...passados, proximo])).not.toContain("major");
  });
  it("menos de 2 Majors passados cobertos pelo histórico → sem sinal", () => {
    expect(tipos(serie(200, comQueda), [...passados, proximo])).not.toContain("major");
  });
  it("Major longe (mais de 45 dias) → sem sinal", () => {
    const longe = maj(AGORA + 90 * DIA);
    expect(tipos(serie(500, comQueda), [...passados, longe])).not.toContain("major");
  });
});

describe("descreverMotivos (dica do item)", () => {
  it("junta os motivos em linhas, em cada idioma, com o título Bom momento para vender", () => {
    definirIdioma("pt");
    const v = { pontos: 90, bom: true, motivos: [{ tipo: "queda", pct: 40 }, { tipo: "major", dias: 12, caiu: 3, de: 4 }] as const };
    const t = descreverMotivos(v.motivos);
    expect(t).toContain("Caiu 40%");
    expect(t).toContain("Major em 12 dias");
    expect(t).toContain("3 de 4");
    expect(t.split("\n")[0]).toBe("Bom momento para vender");
    expect(t).not.toContain("estimativa");
    definirIdioma("en");
    expect(descreverMotivos(v.motivos)).toContain("Major in 12 days");
    definirIdioma("pt");
  });
  it("Major em curso (0 dias) tem texto próprio", () => {
    expect(descreverMotivos([{ tipo: "major", dias: 0, caiu: 2, de: 2 }])).toContain("em andamento");
  });
});
