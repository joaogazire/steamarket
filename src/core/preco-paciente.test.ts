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
  it("rápido = mediana; médio < paciente em preço; a ordem é rápido ≤ médio ≤ paciente", () => {
    const [r, m, p] = (["rapido", "medio", "paciente"] as const).map((x) => precoPaciente(h, AGORA, x)!);
    expect(r!.q).toBe(0.5);
    expect(m!.q).toBe(0.7);
    expect(r!.preco).toBeLessThanOrEqual(m!.preco);
    expect(m!.preco).toBeLessThanOrEqual(p!.preco);
    expect(p!.preco).toBeGreaterThan(r!.preco);
  });
  it("o teto de cada perfil vale (rápido 1,0×, médio 1,2×, paciente 1,3× a mediana)", () => {
    const mediana = precoPaciente(h, AGORA, "rapido")!.preco;
    expect(precoPaciente(h, AGORA, "paciente")!.preco).toBeLessThanOrEqual(Math.round(mediana * 1.3));
    expect(precoPaciente(h, AGORA, "medio")!.preco).toBeLessThanOrEqual(Math.round(mediana * 1.2));
  });
  it("item em queda continua usando a mediana em qualquer perfil", () => {
    const queda = horaria(100, (x) => [3 + (x / 2400) * 3 + ((x * 7) % 5) * 0.01, 1.5]);
    expect(precoPaciente(queda, AGORA, "paciente")!.q).toBe(0.5);
  });
  it("lerPerfil: valor salvo inválido volta ao padrão paciente", () => {
    expect(lerPerfil("rapido")).toBe("rapido");
    expect(lerPerfil("medio")).toBe("medio");
    expect(lerPerfil("x")).toBe("paciente");
    expect(lerPerfil(undefined)).toBe("paciente");
  });
});

describe("item barato (taxa alta): mira mais alto para fugir do piso de taxa", () => {
  const barato = horaria(20, (h) => [0.3 + ((h * 7) % 11) * 0.02, 1.5]); // 0,30 a 0,50, ~35 vendas/dia
  it("paciente usa percentil 90; médio e rápido seguem as regras normais", () => {
    expect(precoPaciente(barato, AGORA, "paciente")!.q).toBe(0.9);
    expect(precoPaciente(barato, AGORA, "medio")!.q).toBe(0.7);
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
