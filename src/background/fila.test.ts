import { describe, expect, it } from "vitest";
import { ErroCancelado, ErroLimite, criarFila } from "./fila.ts";

// Relógio falso: dormir() avança o tempo sem esperar de verdade.
function relogio() {
  let agora = 1_000_000;
  const esperas: number[] = [];
  return {
    esperas,
    agora: () => agora,
    dormir: async (ms: number) => {
      esperas.push(ms);
      agora += ms;
    },
  };
}

describe("fila PRC-04 / SEL-04: uma requisição por vez", () => {
  it("nunca executa duas tarefas ao mesmo tempo e mantém a ordem", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    let ativas = 0;
    let maxAtivas = 0;
    const ordem: number[] = [];
    const tarefa = (n: number) => async () => {
      ativas++;
      maxAtivas = Math.max(maxAtivas, ativas);
      await Promise.resolve();
      ordem.push(n);
      ativas--;
      return n;
    };
    const res = await Promise.all([fila.enfileirar(tarefa(1)), fila.enfileirar(tarefa(2)), fila.enfileirar(tarefa(3))]);
    expect(res).toEqual([1, 2, 3]);
    expect(maxAtivas).toBe(1);
    expect(ordem).toEqual([1, 2, 3]);
  });

  it("respeita a pausa mínima de 3 s entre tarefas", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    const inicios: number[] = [];
    const t = () => async () => {
      inicios.push(r.agora());
    };
    await Promise.all([fila.enfileirar(t()), fila.enfileirar(t()), fila.enfileirar(t())]);
    expect(inicios[1]! - inicios[0]!).toBeGreaterThanOrEqual(3000);
    expect(inicios[2]! - inicios[1]!).toBeGreaterThanOrEqual(3000);
  });
});

describe("fila PRC-03 / SEL-04: 429 com recuo exponencial", () => {
  it("dobra a espera a cada 429 e tenta de novo", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    let falhas = 3;
    const v = await fila.enfileirar(async () => {
      if (falhas-- > 0) throw new ErroLimite();
      return "ok";
    });
    expect(v).toBe("ok");
    expect(r.esperas).toEqual([3000, 6000, 12000]);
  });

  it("limita o recuo a 60 s e desiste após 8 novas tentativas com ErroLimite", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    await expect(
      fila.enfileirar(async () => {
        throw new ErroLimite();
      }),
    ).rejects.toBeInstanceOf(ErroLimite);
    expect(r.esperas).toEqual([3000, 6000, 12000, 24000, 48000, 60000, 60000, 60000]);
  });

  it("avisa a interface ao pausar", async () => {
    const r = relogio();
    const avisos: number[] = [];
    const fila = criarFila({ ...r, pausaMs: 3000, aoPausar: (ms) => avisos.push(ms) });
    let falhas = 1;
    await fila.enfileirar(async () => {
      if (falhas-- > 0) throw new ErroLimite();
    });
    expect(avisos).toEqual([3000]);
  });

  it("zera o recuo depois de um sucesso", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    let f1 = 2;
    await fila.enfileirar(async () => {
      if (f1-- > 0) throw new ErroLimite();
    });
    r.esperas.length = 0;
    let f2 = 1;
    await fila.enfileirar(async () => {
      if (f2-- > 0) throw new ErroLimite();
    });
    expect(r.esperas.filter((x) => x >= 3000 && x !== 3000)).toEqual([]);
    expect(r.esperas).toContain(3000);
  });

  it("outros erros passam direto, sem recuo", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    await expect(fila.enfileirar(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(r.esperas).toEqual([]);
  });
});

describe("fila: cancelar por grupo", () => {
  it("rejeita as tarefas pendentes do grupo e preserva as dos outros", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    const executadas: string[] = [];
    const t = (nome: string) => async () => {
      executadas.push(nome);
    };
    const p1 = fila.enfileirar(t("a1"), "A");
    const p2 = fila.enfileirar(t("a2"), "A");
    const p3 = fila.enfileirar(t("b1"), "B");
    fila.cancelar("A");
    await expect(p2).rejects.toBeInstanceOf(ErroCancelado);
    await p3;
    await p1.catch(() => undefined);
    expect(executadas).toContain("b1");
    expect(executadas).not.toContain("a2");
  });
});

describe("fila: limite de pendentes", () => {
  it("rejeita com ErroLimite quando há mais de 200 tarefas esperando", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    const todas: Promise<unknown>[] = [];
    for (let i = 0; i < 200; i++) todas.push(fila.enfileirar(async () => i).catch(() => undefined));
    await expect(fila.enfileirar(async () => 0)).rejects.toBeInstanceOf(ErroLimite);
    await Promise.all(todas);
  });
});
