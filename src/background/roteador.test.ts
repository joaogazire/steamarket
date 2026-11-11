import { describe, expect, it, vi } from "vitest";
import type { Cache } from "./cache.ts";
import { ErroLimite } from "./fila.ts";
import { criarRoteador } from "./roteador.ts";
import { ErroFormato, ErroSessao } from "../steam/cliente.ts";

// Cache em memória que respeita a validade, com relógio injetado.
function cacheMemoria(agora: () => number = () => 0): Cache {
  const m = new Map<string, { v: unknown; em: number }>();
  return {
    obter: async <T,>(k: string, ttl: number) => {
      const r = m.get(k);
      return r && agora() - r.em <= ttl ? (r.v as T) : undefined;
    },
    guardar: async (k: string, v: unknown) => void m.set(k, { v, em: agora() }),
  };
}
const filaDireta = () => ({ enfileirar: <T,>(t: () => Promise<T>) => t(), cancelar: vi.fn() });
const steamOk = () => ({
  inventario: vi.fn(async () => []),
  historico: vi.fn(async () => [{ t: 1, preco: 100, volume: 5 }]),
  visaoGeral: vi.fn(async () => ({ menorAnuncio: 120, mediana: 110, volume: 9 })),
  ordens: vi.fn(async () => ({ maiorOrdemCompra: 90, menorAnuncio: 120 })),
  itemNameId: vi.fn(async () => "555"),
});
const msg = { tipo: "preco" as const, appid: "730", nome: "Caixa", moeda: 7, pais: "BR", grupoId: "g1" };

describe("roteador PRC-01 / PRC-02", () => {
  it("devolve visão geral, ordens e histórico do item", async () => {
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk() });
    expect(await r.tratar(msg)).toEqual({
      ok: true,
      dados: {
        visao: { menorAnuncio: 120, mediana: 110, volume: 9 },
        ordens: { maiorOrdemCompra: 90, menorAnuncio: 120 },
        historico: [{ t: 1, preco: 100, volume: 5 }],
      },
    });
  });
  it("duas mensagens iguais seguidas geram uma requisição de cada tipo (cache)", async () => {
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    await r.tratar(msg);
    await r.tratar(msg);
    expect(steam.historico).toHaveBeenCalledTimes(1);
    expect(steam.visaoGeral).toHaveBeenCalledTimes(1);
    expect(steam.ordens).toHaveBeenCalledTimes(1);
  });
  it("o item_nameid é buscado uma só vez por item, mesmo depois de o preço expirar", async () => {
    const steam = steamOk();
    let agora = 0;
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(() => agora), steam });
    await r.tratar(msg);
    agora += 10 ** 10;
    await r.tratar({ ...msg, grupoId: "g2" });
    expect(steam.itemNameId).toHaveBeenCalledTimes(1);
    expect(steam.visaoGeral).toHaveBeenCalledTimes(2); // o preço, esse sim, expirou
  });
  it("ordens de países diferentes não se misturam no cache", async () => {
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    await r.tratar(msg);
    await r.tratar({ ...msg, pais: "US" });
    expect(steam.ordens).toHaveBeenCalledTimes(2);
  });
});

describe("roteador: erros viram mensagens da interface", () => {
  const com = (erro: Error) => {
    const steam = steamOk();
    steam.visaoGeral.mockRejectedValue(erro);
    return criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
  };
  it("sessão expirada", async () => {
    expect(await com(new ErroSessao()).tratar(msg)).toEqual({ ok: false, erro: "sessao", mensagem: "entre na Steam e recarregue" });
  });
  it("limite da Steam", async () => {
    expect(await com(new ErroLimite()).tratar(msg)).toEqual({ ok: false, erro: "limite", mensagem: "aguardando limite da Steam" });
  });
  it("formato inesperado", async () => {
    expect(await com(new ErroFormato("x")).tratar(msg)).toEqual({ ok: false, erro: "formato", mensagem: "resposta inesperada da Steam" });
  });
  it("mensagem inválida não chama a Steam", async () => {
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    expect(await r.tratar({ tipo: "preco", appid: "../x", nome: 5 })).toMatchObject({ ok: false, erro: "formato" });
    expect(steam.visaoGeral).not.toHaveBeenCalled();
  });
});

describe("roteador: cancelar por grupo (troca de jogo)", () => {
  it("repassa o cancelamento à fila", async () => {
    const fila = filaDireta();
    const r = criarRoteador({ fila, cache: cacheMemoria(), steam: steamOk() });
    expect(await r.tratar({ tipo: "cancelar", grupoId: "g1" })).toEqual({ ok: true, dados: null });
    expect(fila.cancelar).toHaveBeenCalledWith("g1");
  });
});

describe("roteador: item_nameid guardado é validado", () => {
  it("valor corrompido no cache é descartado e buscado de novo", async () => {
    const steam = steamOk();
    const cache = cacheMemoria();
    await cache.guardar("nameid:730:Caixa", { lixo: true });
    const r = criarRoteador({ fila: filaDireta(), cache, steam });
    await r.tratar(msg);
    expect(steam.itemNameId).toHaveBeenCalledTimes(1);
  });
  it("página de manutenção com id fora do formato vira erro de formato e não é guardada", async () => {
    const steam = steamOk();
    steam.itemNameId.mockResolvedValue("<html>manutenção</html>");
    const cache = cacheMemoria();
    const r = criarRoteador({ fila: filaDireta(), cache, steam });
    expect(await r.tratar(msg)).toMatchObject({ ok: false, erro: "formato" });
    expect(await cache.obter("nameid:730:Caixa", Infinity)).toBeUndefined();
  });
});

describe("roteador: inventário passa pela fila (INV-02)", () => {
  const entrada = { tipo: "inventario" as const, steamid: "76561198000000000", appid: "730", contextid: "2", grupoId: "730_2" };
  it("devolve os ativos e usa a fila do grupo", async () => {
    const steam = { ...steamOk(), inventario: vi.fn(async () => [{ assetid: "1", appid: 730, contextid: "2", market_hash_name: "x", marketable: true }]) };
    const fila = { enfileirar: vi.fn(<T,>(t: () => Promise<T>) => t()), cancelar: vi.fn() };
    const r = criarRoteador({ fila: fila as never, cache: cacheMemoria(), steam });
    const resp = await r.tratar(entrada);
    expect(resp).toEqual({ ok: true, dados: [{ assetid: "1", appid: 730, contextid: "2", market_hash_name: "x", marketable: true }] });
    expect(fila.enfileirar).toHaveBeenCalledWith(expect.any(Function), "730_2");
    expect(steam.inventario).toHaveBeenCalledWith("76561198000000000", "730", "2");
  });
  it("steamid inválido nem chega à Steam", async () => {
    const steam = { ...steamOk(), inventario: vi.fn() };
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    expect(await r.tratar({ ...entrada, steamid: "../x" })).toMatchObject({ ok: false, erro: "formato" });
    expect(steam.inventario).not.toHaveBeenCalled();
  });
});
