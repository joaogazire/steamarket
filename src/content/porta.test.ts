import { describe, expect, it, vi } from "vitest";
import { tratarPorta } from "./porta.ts";

// PRC-03: enquanto a fila espera por causa de um 429, o painel mostra "aguardando limite da Steam".
describe("tratarPorta", () => {
  it("pausa mostra 'aguardando limite da Steam (N s)' e depois limpa o aviso", () => {
    vi.useFakeTimers();
    const avisar = vi.fn();
    tratarPorta({ tipo: "pausa", ms: 6000 }, { avisar, progresso: vi.fn() });
    expect(avisar).toHaveBeenLastCalledWith("aguardando limite da Steam (6 s)");
    vi.advanceTimersByTime(6000);
    expect(avisar).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });
  it("ms absurdo (negativo, gigante, NaN) é ignorado ou limitado a 2 minutos", () => {
    vi.useFakeTimers();
    const avisar = vi.fn();
    tratarPorta({ tipo: "pausa", ms: -5 }, { avisar, progresso: vi.fn() });
    tratarPorta({ tipo: "pausa", ms: NaN }, { avisar, progresso: vi.fn() });
    expect(avisar).not.toHaveBeenCalled();
    tratarPorta({ tipo: "pausa", ms: 10 ** 12 }, { avisar, progresso: vi.fn() });
    expect(avisar).toHaveBeenLastCalledWith("aguardando limite da Steam (120 s)");
    vi.advanceTimersByTime(120_000);
    expect(avisar).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });
  it("progresso repassa lote, k e n", () => {
    const progresso = vi.fn();
    tratarPorta({ tipo: "progresso", loteId: "L1", k: 2, n: 5 }, { avisar: vi.fn(), progresso });
    expect(progresso).toHaveBeenCalledWith("L1", 2, 5);
  });
  it("progresso inválido (NaN, negativo, k > n, n = 0) é ignorado", () => {
    const progresso = vi.fn();
    const a = { avisar: vi.fn(), progresso };
    for (const [k, n] of [[NaN, 3], [-1, 3], [4, 3], [1, 0], [1.5, 3]]) tratarPorta({ tipo: "progresso", loteId: "L", k, n }, a);
    expect(progresso).not.toHaveBeenCalled();
  });
  it("uma nova pausa cancela o timer da anterior", () => {
    vi.useFakeTimers();
    const avisar = vi.fn();
    const a = { avisar, progresso: vi.fn() };
    tratarPorta({ tipo: "pausa", ms: 3000 }, a);
    vi.advanceTimersByTime(2000);
    tratarPorta({ tipo: "pausa", ms: 6000 }, a);
    vi.advanceTimersByTime(1500); // o timer antigo dispararia aqui
    expect(avisar).not.toHaveBeenCalledWith(null);
    vi.advanceTimersByTime(4500);
    expect(avisar).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });
  it("mensagens fora do formato são ignoradas", () => {
    const avisar = vi.fn();
    const progresso = vi.fn();
    tratarPorta({ tipo: "pausa", ms: "x" }, { avisar, progresso });
    tratarPorta({ tipo: "progresso", loteId: 7 }, { avisar, progresso });
    tratarPorta(null, { avisar, progresso });
    expect(avisar).not.toHaveBeenCalled();
    expect(progresso).not.toHaveBeenCalled();
  });
});
