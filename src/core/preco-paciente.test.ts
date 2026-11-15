import { describe, expect, it } from "vitest";
import { medianaUltimas } from "./historico.ts";
import { lerPerfil, precoPaciente } from "./preco-paciente.ts";
import type { Ponto } from "./tipos.ts";

const HORA = 3_600_000;
const AGORA = Date.UTC(2026, 10, 13, 12);

/** Série horária dos últimos `dias` dias: `f(horasAtras)` → [preço em reais, volume]. */
function horaria(dias: number, f: (h: number) => [number, number]): Ponto[] {
  const p: Ponto[] = [];
  for (let h = dias * 24 - 1; h >= 0; h--) {
    const [preco, volume] = f(h);
    p.push({ t: AGORA - h * HORA, preco: Math.round(preco * 100), volume });
  }
  return p;
}
/** oscila entre 0,85 e 1,15 (como a carta de R$ 1,00): preço varia por hora, ~35 vendas/dia */
const oscila = (h: number): [number, number] => [0.85 + ((h * 7) % 11) * 0.03, 1.5];

describe("precoPaciente", () => {
  it("liquidez alta: fica acima da mediana (espera um pouco por mais), dentro do teto", () => {
    const h = horaria(20, oscila);
    const r = precoPaciente(h, AGORA)!;
    const mediana = medianaUltimas(h, 50).preco!;
    expect(r.preco).toBeGreaterThan(mediana);
    expect(r.preco).toBeLessThanOrEqual(Math.round(mediana * 1.2));
  });
  it("um pico isolado de preço alto não puxa o preço para cima", () => {
    const base = horaria(20, oscila);
    const normal = precoPaciente(base, AGORA)!.preco;
    const comPico = base.map((p, i) => (i === 100 ? { ...p, preco: 1500, volume: 1 } : p));
    expect(precoPaciente(comPico, AGORA)!.preco).toBeLessThanOrEqual(Math.round(normal * 1.05));
  });
  it("uma venda barata isolada não derruba o preço (R$ 0,75 no meio de R$ 1,00)", () => {
    const base = horaria(20, oscila);
    const normal = precoPaciente(base, AGORA)!.preco;
    const comBaixa = base.map((p, i) => (i === 200 ? { ...p, preco: 75, volume: 6 } : p));
    expect(precoPaciente(comBaixa, AGORA)!.preco).toBeGreaterThanOrEqual(Math.round(normal * 0.97));
  });
  it("liquidez baixa (~1 venda/dia): usa a mediana, sem apostar em preço alto", () => {
    const h = horaria(20, (x) => [0.85 + ((x * 7) % 11) * 0.03, x % 24 === 0 ? 1 : 0]);
    const r = precoPaciente(h, AGORA)!;
    expect(r.q).toBe(0.5);
  });
  it("item em queda: q = 0,5 (vende antes de cair mais)", () => {
    const h = horaria(100, (x) => [3 + (x / 2400) * 3 + ((x * 7) % 5) * 0.01, 1.5]); // caiu de 6 para 3 em 100 dias
    expect(precoPaciente(h, AGORA)!.q).toBe(0.5);
  });
  it("menos de 10 vendas em 30 dias: cai para a mediana das últimas 50 vendas", () => {
    const h: Ponto[] = [
      { t: AGORA - 40 * 24 * HORA, preco: 300, volume: 5 },
      { t: AGORA - 35 * 24 * HORA, preco: 320, volume: 5 },
      { t: AGORA - 33 * 24 * HORA, preco: 310, volume: 5 },
    ];
    expect(precoPaciente(h, AGORA)!.preco).toBe(medianaUltimas(h, 50).preco);
  });
  it("sem histórico: null", () => {
    expect(precoPaciente([], AGORA)).toBeNull();
  });
});

describe("perfis de venda", () => {
  const h = horaria(20, oscila);
  it("padrão é paciente (mira preço melhor, espera um pouco mais)", () => {
    expect(precoPaciente(h, AGORA)).toEqual(precoPaciente(h, AGORA, "paciente"));
    expect(precoPaciente(h, AGORA)!.q).toBe(0.8);
  });
  it("rápido = mediana; a ordem é rápido ≤ paciente", () => {
    const [r, p] = (["rapido", "paciente"] as const).map((x) => precoPaciente(h, AGORA, x)!);
    expect(r!.q).toBe(0.5);
    expect(r!.preco).toBeLessThanOrEqual(p!.preco);
    expect(p!.preco).toBeGreaterThan(r!.preco);
  });
  it("o teto de cada perfil vale (rápido 1,0×, paciente 1,3× a mediana)", () => {
    const mediana = precoPaciente(h, AGORA, "rapido")!.preco;
    expect(precoPaciente(h, AGORA, "paciente")!.preco).toBeLessThanOrEqual(Math.round(mediana * 1.3));
  });
  it("item em queda continua usando a mediana em qualquer perfil", () => {
    const queda = horaria(100, (x) => [3 + (x / 2400) * 3 + ((x * 7) % 5) * 0.01, 1.5]);
    expect(precoPaciente(queda, AGORA, "paciente")!.q).toBe(0.5);
  });
  it("lerPerfil: valor salvo inválido volta ao padrão paciente", () => {
    expect(lerPerfil("rapido")).toBe("rapido");
    expect(lerPerfil("maximo")).toBe("maximo");
    expect(lerPerfil("medio")).toBe("paciente"); // perfil removido: valor antigo salvo volta ao padrão
    expect(lerPerfil("x")).toBe("paciente");
    expect(lerPerfil(undefined)).toBe("paciente");
  });
});

describe("item barato (taxa alta): mira mais alto para fugir do piso de taxa", () => {
  const barato = horaria(20, (h) => [0.3 + ((h * 7) % 11) * 0.02, 1.5]); // 0,30 a 0,50, ~35 vendas/dia
  it("paciente usa percentil 90; rápido segue as regras normais", () => {
    expect(precoPaciente(barato, AGORA, "paciente")!.q).toBe(0.9);
    expect(precoPaciente(barato, AGORA, "rapido")!.q).toBe(0.5);
  });
  it("sobe acima do que o paciente pediria sem o reforço, dentro do teto de 1,5× a mediana", () => {
    const r = precoPaciente(barato, AGORA, "paciente")!;
    const mediana = precoPaciente(barato, AGORA, "rapido")!.preco;
    expect(r.preco).toBeGreaterThan(mediana);
    expect(r.preco).toBeLessThanOrEqual(Math.round(mediana * 1.5));
  });
  it("item caro (acima do limite) continua com percentil 80", () => {
    expect(precoPaciente(horaria(20, (h) => [2 + ((h * 7) % 11) * 0.05, 1.5]), AGORA, "paciente")!.q).toBe(0.8);
  });
});

describe("perfil máximo (6 meses)", () => {
  /** 180 dias, 1 ponto por dia, ~20 vendas/dia; preço varia de 1,00 a 2,00 (dia % 11) */
  const DIA = 24 * HORA;
  const seis = (f: (d: number) => number, vol = 20): Ponto[] =>
    Array.from({ length: 180 }, (_, i) => {
      const d = 179 - i;
      return { t: AGORA - d * DIA, preco: Math.round(f(d) * 100), volume: vol };
    });
  const varia = (d: number) => 1 + ((d * 7) % 11) / 10;

  it("mira o topo do que o item já vendeu em 6 meses: acima do paciente e do rápido", () => {
    const h = seis((d) => varia(d) + (d > 30 ? 0.4 : 0)); // últimos 30 dias mais baratos que os meses anteriores
    const m = precoPaciente(h, AGORA, "maximo")!;
    expect(m.preco).toBeGreaterThan(precoPaciente(h, AGORA, "paciente")!.preco);
    expect(m.q).toBe(0.9);
    expect(m.base).toContain("6 meses");
  });
  it("nunca passa de 1,5× a mediana dos 6 meses", () => {
    const h = seis(varia);
    const mediana = medianaUltimas(h, 3600).preco!;
    expect(precoPaciente(h, AGORA, "maximo")!.preco).toBeLessThanOrEqual(Math.round(mediana * 1.5));
  });
  it("um pico de 1 venda a R$ 50 não puxa o preço", () => {
    const h = seis(varia);
    const comPico = h.map((p, i) => (i === 90 ? { ...p, preco: 5000, volume: 1 } : p));
    expect(precoPaciente(comPico, AGORA, "maximo")!.preco).toBe(precoPaciente(h, AGORA, "maximo")!.preco);
  });
  it("só conta vendas dos últimos 180 dias", () => {
    const h = [{ t: AGORA - 200 * DIA, preco: 90000, volume: 500 }, ...seis(varia)];
    expect(precoPaciente(h, AGORA, "maximo")!.preco).toBe(precoPaciente(seis(varia), AGORA, "maximo")!.preco);
  });
  it("histórico curto (menos de 10 vendas em 6 meses): cai para o resultado do paciente", () => {
    const h = seis(varia, 0).map((p, i) => (i === 0 ? { ...p, volume: 3 } : p));
    expect(precoPaciente(h, AGORA, "maximo")).toEqual(precoPaciente(h, AGORA, "paciente"));
  });
  it("nunca devolve menos que o paciente", () => {
    const h = seis((d) => 3 + d * 0.01); // caiu de ~4,8 para 3
    expect(precoPaciente(h, AGORA, "maximo")!.preco).toBeGreaterThanOrEqual(precoPaciente(h, AGORA, "paciente")!.preco);
  });
});
