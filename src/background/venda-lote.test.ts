import { describe, expect, it, vi } from "vitest";
import type { Ativo } from "../core/tipos.ts";
import { ErroLimite, criarFila } from "./fila.ts";
import { iniciarLote } from "./venda-lote.ts";
import { ErroFormato, ErroSessao, type ResultadoVenda } from "../steam/cliente.ts";

const ativos: Ativo[] = ["1", "2", "3"].map((id) => ({ assetid: id, appid: 730, contextid: "2", market_hash_name: "x", marketable: true }));

function relogio() {
  let agora = 1_000_000;
  return { agora: () => agora, dormir: async (ms: number) => void (agora += ms) };
}
const ok: ResultadoVenda = { ok: true, precisaConfirmar: true };

describe("iniciarLote SEL-01..04", () => {
  it("envia uma venda por vez com pausa mínima de 3 s", async () => {
    const r = relogio();
    const fila = criarFila({ ...r, pausaMs: 3000 });
    const instantes: number[] = [];
    const vender = vi.fn(async () => {
      instantes.push(r.agora());
      return ok;
    });
    const lote = iniciarLote({ fila, vender }, ativos, 1000, "lote1");
    const res = await lote.concluido;
    expect(res.vendidos).toBe(3);
    expect(instantes[1]! - instantes[0]!).toBeGreaterThanOrEqual(3000);
    expect(instantes[2]! - instantes[1]!).toBeGreaterThanOrEqual(3000);
  });

  it("uma recusa no item 2 de 3 não impede o 3", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi
      .fn<(a: Ativo, l: number) => Promise<ResultadoVenda>>()
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ ok: false, motivo: "anúncio duplicado" })
      .mockResolvedValueOnce(ok);
    const res = await iniciarLote({ fila, vender }, ativos, 1000, "lote2").concluido;
    expect(res.vendidos).toBe(2);
    expect(res.recusados).toEqual([{ assetid: "2", motivo: "anúncio duplicado" }]);
    expect(vender).toHaveBeenCalledTimes(3);
  });

  it("passa o líquido em centavos a cada venda", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi.fn(async () => ok);
    await iniciarLote({ fila, vender }, ativos.slice(0, 1), 1234, "lote3").concluido;
    expect(vender).toHaveBeenCalledWith(ativos[0], 1234);
  });

  it("cancelar interrompe antes do próximo envio", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi.fn(async () => ok);
    const lote = iniciarLote({ fila, vender }, ativos, 1000, "lote4", () => lote.cancelar());
    const res = await lote.concluido;
    expect(vender).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ vendidos: 1, cancelado: true });
  });

  it("429 repetido pausa e retoma sem perder a venda", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    let falhas = 2;
    const vender = vi.fn(async () => {
      if (falhas-- > 0) throw new ErroLimite();
      return ok;
    });
    const res = await iniciarLote({ fila, vender }, ativos.slice(0, 1), 1000, "lote5").concluido;
    expect(res.vendidos).toBe(1);
    expect(vender).toHaveBeenCalledTimes(3);
  });

  it("sessão expirada aborta o lote e não tenta os demais", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi
      .fn<(a: Ativo, l: number) => Promise<ResultadoVenda>>()
      .mockResolvedValueOnce(ok)
      .mockRejectedValueOnce(new ErroSessao());
    const res = await iniciarLote({ fila, vender }, ativos, 1000, "lote6").concluido;
    expect(res).toMatchObject({ vendidos: 1, abortado: "sessao" });
    expect(vender).toHaveBeenCalledTimes(2);
  });

  it("informa o progresso k de N depois de cada item", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const progresso: [number, number][] = [];
    await iniciarLote({ fila, vender: async () => ok }, ativos, 1000, "lote7", (k, n) => progresso.push([k, n])).concluido;
    expect(progresso).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("erro no callback de progresso não derruba o lote", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const res = await iniciarLote({ fila, vender: async () => ok }, ativos, 1000, "lote10", () => {
      throw new Error("aba fechada");
    }).concluido;
    expect(res.vendidos).toBe(3);
  });

  it("cancelar durante um 429 não faz nova tentativa de venda", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    let lote!: ReturnType<typeof iniciarLote>;
    const vender = vi.fn(async () => {
      await Promise.resolve(); // a fila chama vender de forma síncrona; espera `lote` ser atribuído
      lote.cancelar();
      throw new ErroLimite();
    });
    lote = iniciarLote({ fila, vender }, ativos, 1000, "lote11");
    const res = await lote.concluido;
    expect(vender).toHaveBeenCalledTimes(1);
    expect(res.cancelado).toBe(true);
    expect(res.vendidos).toBe(0);
  });

  it("3 respostas inesperadas seguidas abortam o lote", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const mais: Ativo[] = [...ativos, ...ativos.map((a) => ({ ...a, assetid: a.assetid + "0" }))];
    const vender = vi.fn(async () => {
      throw new ErroFormato("status 500");
    });
    const res = await iniciarLote({ fila, vender }, mais, 1000, "lote12").concluido;
    expect(res.abortado).toBe("formato");
    expect(vender).toHaveBeenCalledTimes(3);
  });

  it("uma recusa normal no meio zera a contagem de erros inesperados", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi
      .fn<(a: Ativo, l: number) => Promise<ResultadoVenda>>()
      .mockRejectedValueOnce(new ErroFormato("x"))
      .mockRejectedValueOnce(new ErroFormato("x"))
      .mockResolvedValueOnce(ok)
      .mockRejectedValueOnce(new ErroFormato("x"));
    const res = await iniciarLote({ fila, vender }, [...ativos, ativos[0]!], 1000, "lote13").concluido;
    expect(res.abortado).toBeNull();
  });

  it("conta quantas vendas esperam confirmação no celular", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi
      .fn<(a: Ativo, l: number) => Promise<ResultadoVenda>>()
      .mockResolvedValueOnce({ ok: true, precisaConfirmar: true })
      .mockResolvedValueOnce({ ok: true, precisaConfirmar: false })
      .mockResolvedValueOnce({ ok: true, precisaConfirmar: true });
    const res = await iniciarLote({ fila, vender }, ativos, 1000, "lote8").concluido;
    expect(res.precisaConfirmar).toBe(2);
  });

  it("erro inesperado vira recusa daquele item e o lote segue", async () => {
    const fila = criarFila({ ...relogio(), pausaMs: 3000 });
    const vender = vi
      .fn<(a: Ativo, l: number) => Promise<ResultadoVenda>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(ok);
    const res = await iniciarLote({ fila, vender }, ativos, 1000, "lote9").concluido;
    expect(res.recusados).toEqual([{ assetid: "1", motivo: "boom" }]);
    expect(res.vendidos).toBe(2);
  });
});

import { validarPedidoLote } from "./venda-lote.ts";

describe("validarPedidoLote (mensagem vinda do painel)", () => {
  const ok = {
    tipo: "lote-iniciar", loteId: "730_2-1", sessionid: "abc123", steamid: "76561198000000000", liquido: 1234,
    ativos: [{ assetid: "100", appid: 730, contextid: "2" }],
  };
  it("aceita um pedido válido e monta os ativos", () => {
    const p = validarPedidoLote(ok);
    expect(p?.liquido).toBe(1234);
    expect(p?.ativos).toEqual([{ assetid: "100", appid: 730, contextid: "2", market_hash_name: "", marketable: true }]);
  });
  it("recusa preço inválido, enorme ou não inteiro", () => {
    for (const liquido of [0, -1, 12.5, 10_000_001, NaN, "10"]) expect(validarPedidoLote({ ...ok, liquido })).toBeNull();
  });
  it("recusa ativos mal formados ou em excesso", () => {
    expect(validarPedidoLote({ ...ok, ativos: [] })).toBeNull();
    expect(validarPedidoLote({ ...ok, ativos: [{ assetid: "../x", appid: 730, contextid: "2" }] })).toBeNull();
    expect(validarPedidoLote({ ...ok, ativos: Array.from({ length: 501 }, () => ok.ativos[0]) })).toBeNull();
  });
  it("recusa sessão, steamid ou lote fora do formato", () => {
    expect(validarPedidoLote({ ...ok, sessionid: "a b" })).toBeNull();
    expect(validarPedidoLote({ ...ok, steamid: "123" })).toBeNull();
    expect(validarPedidoLote({ ...ok, loteId: "" })).toBeNull();
    expect(validarPedidoLote(null)).toBeNull();
  });
});
