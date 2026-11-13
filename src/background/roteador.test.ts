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
  anuncios: vi.fn(async (_appid: string, start: number) =>
    start === 0
      ? { total: 150, itens: { "730_2_1": 100, "730_2_2": null } as Record<string, number | null> }
      : { total: 150, itens: { "730_2_3": 300 } as Record<string, number | null> }),
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
    expect(await com(new ErroFormato("x")).tratar(msg)).toEqual({ ok: false, erro: "formato", mensagem: "resposta inesperada da Steam: x" });
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
  it("página de manutenção com id fora do formato não é guardada e o preço sai sem ordens", async () => {
    const steam = steamOk();
    steam.itemNameId.mockResolvedValue("<html>manutenção</html>");
    const cache = cacheMemoria();
    const r = criarRoteador({ fila: filaDireta(), cache, steam });
    expect(await r.tratar(msg)).toMatchObject({ ok: true, dados: { ordens: { maiorOrdemCompra: null, menorAnuncio: null } } });
    expect(await cache.obter("nameid:730:Caixa", Infinity)).toBeUndefined();
    expect(steam.ordens).not.toHaveBeenCalled();
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

describe("roteador: ordens opcionais e histórico leve (captura real 11/11/2026)", () => {
  it("se o item_nameid não puder ser obtido, o preço sai sem ordens em vez de falhar", async () => {
    const steam = steamOk();
    steam.itemNameId.mockRejectedValue(new ErroFormato("sem item_nameid"));
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    expect(await r.tratar(msg)).toEqual({
      ok: true,
      dados: {
        visao: { menorAnuncio: 120, mediana: 110, volume: 9 },
        ordens: { maiorOrdemCompra: null, menorAnuncio: null },
        historico: [{ t: 1, preco: 100, volume: 5 }],
      },
    });
    expect(steam.ordens).not.toHaveBeenCalled();
  });
  it("erro de sessão no item_nameid continua sendo erro de sessão", async () => {
    const steam = steamOk();
    steam.itemNameId.mockRejectedValue(new ErroSessao());
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    expect(await r.tratar(msg)).toMatchObject({ ok: false, erro: "sessao" });
  });
  it("tipo historico devolve só os pontos, sem consultar visão, ordens nem item_nameid", async () => {
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    const res = await r.tratar({ tipo: "historico", appid: "730", nome: "Caixa", grupoId: "g1" });
    expect(res).toEqual({ ok: true, dados: [{ t: 1, preco: 100, volume: 5 }] });
    expect(steam.visaoGeral).not.toHaveBeenCalled();
    expect(steam.ordens).not.toHaveBeenCalled();
    expect(steam.itemNameId).not.toHaveBeenCalled();
  });
  it("historico e preco compartilham o cache do histórico", async () => {
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    await r.tratar({ tipo: "historico", appid: "730", nome: "Caixa", grupoId: "g1" });
    await r.tratar(msg);
    expect(steam.historico).toHaveBeenCalledTimes(1);
  });
  it("historico rejeita appid ou nome fora do formato", async () => {
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk() });
    expect(await r.tratar({ tipo: "historico", appid: "73x", nome: "Caixa", grupoId: "g1" })).toMatchObject({ ok: false, erro: "formato" });
    expect(await r.tratar({ tipo: "historico", appid: "730", nome: "", grupoId: "g1" })).toMatchObject({ ok: false, erro: "formato" });
  });
});

describe("roteador: falha do item_nameid é lembrada por um tempo", () => {
  it("depois de falhar, o preço seguinte não volta a pedir a página de listagem", async () => {
    const steam = steamOk();
    steam.itemNameId.mockRejectedValue(new ErroFormato("sem item_nameid"));
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    await r.tratar(msg);
    await r.tratar({ ...msg, grupoId: "g2" });
    expect(steam.itemNameId).toHaveBeenCalledTimes(1);
  });
  it("passado o prazo, tenta de novo", async () => {
    const steam = steamOk();
    steam.itemNameId.mockRejectedValue(new ErroFormato("sem item_nameid"));
    let agora = 0;
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(() => agora), steam });
    await r.tratar(msg);
    agora += 11 * 60_000;
    await r.tratar({ ...msg, grupoId: "g2" });
    expect(steam.itemNameId).toHaveBeenCalledTimes(2);
  });
});

describe("roteador: anuncios (itens já listados)", () => {
  const pedido = { tipo: "anuncios" as const, appid: "730", grupoId: "730_2" };
  it("junta todas as páginas (100 por vez) e devolve id do quadrado → preço", async () => {
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    expect(await r.tratar(pedido)).toEqual({ ok: true, dados: { "730_2_1": 100, "730_2_2": null, "730_2_3": 300 } });
    expect(steam.anuncios.mock.calls.map((c) => c[1])).toEqual([0, 100]);
  });
  it("nunca passa de 10 páginas, mesmo que o total anunciado seja enorme", async () => {
    const steam = steamOk();
    steam.anuncios.mockImplementation(async (_a: string, start: number) => ({ total: 10 ** 9, itens: { [`730_2_${start}`]: 1 } }));
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    await r.tratar(pedido);
    expect(steam.anuncios).toHaveBeenCalledTimes(10);
  });
  it("erro de sessão na lista de anúncios vira erro de sessão", async () => {
    const steam = steamOk();
    steam.anuncios.mockRejectedValue(new ErroSessao());
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    expect(await r.tratar(pedido)).toMatchObject({ ok: false, erro: "sessao" });
  });
  it("rejeita appid fora do formato", async () => {
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk() });
    expect(await r.tratar({ ...pedido, appid: "73x" })).toMatchObject({ ok: false, erro: "formato" });
  });
});

describe("roteador: erro de formato diz o que falhou", () => {
  it("a mensagem de ErroFormato traz o detalhe", async () => {
    const steam = steamOk();
    steam.inventario.mockRejectedValue(new ErroFormato("asset sem descrição"));
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam });
    const res = await r.tratar({ tipo: "inventario", steamid: "76561198000000000", appid: "730", contextid: "2", grupoId: "730_2" });
    expect(res).toMatchObject({ ok: false, erro: "formato" });
    expect((res as { mensagem: string }).mensagem).toContain("asset sem descrição");
  });
  it("mensagem recusada na validação diz qual tipo chegou", async () => {
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk() });
    const res = await r.tratar({ tipo: "inventario", steamid: "x", appid: "730", contextid: "2", grupoId: "g" });
    expect((res as { mensagem: string }).mensagem).toContain("inventario");
  });
});

describe("roteador: preços em massa (csgotrader)", () => {
  const tabela = { precos: { Caixa: { last_7d: 0.38 }, Faca: { last_7d: 100 } }, taxas: { USD: 1, BRL: 5.5 } };
  const pedido = { tipo: "precos-massa", appid: "730", nomes: ["Caixa", "Faca", "Outro"], moeda: 7, grupoId: "g1" };

  it("devolve centavos por nome, sem passar pela fila da Steam", async () => {
    const fila = { enfileirar: vi.fn(), cancelar: vi.fn() };
    const precosMassa = vi.fn(async () => tabela);
    const r = criarRoteador({ fila, cache: cacheMemoria(), steam: steamOk(), precosMassa });
    expect(await r.tratar(pedido)).toEqual({ ok: true, dados: { Caixa: 209, Faca: 55000 } });
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });
  it("baixa a tabela uma vez e guarda por 6 h", async () => {
    let agora = 0;
    const precosMassa = vi.fn(async () => tabela);
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(() => agora), steam: steamOk(), precosMassa, agora: () => agora });
    await r.tratar(pedido);
    agora += 5 * 3_600_000;
    await r.tratar(pedido);
    expect(precosMassa).toHaveBeenCalledTimes(1);
    agora += 2 * 3_600_000;
    await r.tratar(pedido);
    expect(precosMassa).toHaveBeenCalledTimes(2);
  });
  it("pedidos simultâneos dividem o mesmo download", async () => {
    const precosMassa = vi.fn(async () => tabela);
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk(), precosMassa });
    await Promise.all([r.tratar(pedido), r.tratar(pedido)]);
    expect(precosMassa).toHaveBeenCalledTimes(1);
  });
  it("outro jogo que não o CS2 devolve vazio sem baixar nada", async () => {
    const precosMassa = vi.fn(async () => tabela);
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk(), precosMassa });
    expect(await r.tratar({ ...pedido, appid: "440" })).toEqual({ ok: true, dados: {} });
    expect(precosMassa).not.toHaveBeenCalled();
  });
  it("falha no download vira erro e a próxima chamada tenta de novo", async () => {
    const precosMassa = vi.fn().mockRejectedValueOnce(new ErroFormato("status 503")).mockResolvedValueOnce(tabela);
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk(), precosMassa });
    expect(await r.tratar(pedido)).toMatchObject({ ok: false, erro: "formato" });
    expect(await r.tratar(pedido)).toMatchObject({ ok: true });
  });
  it("rejeita lista de nomes fora do formato", async () => {
    const precosMassa = vi.fn(async () => tabela);
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(), steam: steamOk(), precosMassa });
    for (const nomes of ["Caixa", [1], ["x".repeat(301)], Array.from({ length: 5001 }, () => "a")]) {
      expect(await r.tratar({ ...pedido, nomes })).toMatchObject({ ok: false, erro: "formato" });
    }
    expect(precosMassa).not.toHaveBeenCalled();
  });
});

describe("roteador: histórico guardado por 12 h", () => {
  it("não pede o histórico de novo antes de 12 h", async () => {
    let agora = 0;
    const steam = steamOk();
    const r = criarRoteador({ fila: filaDireta(), cache: cacheMemoria(() => agora), steam });
    const h = { tipo: "historico", appid: "730", nome: "Caixa", grupoId: "g1" };
    await r.tratar(h);
    agora += 11 * 3_600_000;
    await r.tratar(h);
    expect(steam.historico).toHaveBeenCalledTimes(1);
    agora += 2 * 3_600_000;
    await r.tratar(h);
    expect(steam.historico).toHaveBeenCalledTimes(2);
  });
});

describe("roteador: tabela em massa vinda do IndexedDB não ganha validade nova (code-review)", () => {
  it("tabela guardada há 5h50 é baixada de novo em no máximo 1 h", async () => {
    let agora = 0;
    const cache = cacheMemoria(() => agora);
    await cache.guardar("massa:tabela", { precos: {}, taxas: { BRL: 5 } });
    agora = 5 * 3_600_000 + 50 * 60_000;
    const precosMassa = vi.fn(async () => ({ precos: {}, taxas: { BRL: 5 } }));
    const r = criarRoteador({ fila: filaDireta(), cache, steam: steamOk(), precosMassa, agora: () => agora });
    const pedido = { tipo: "precos-massa", appid: "730", nomes: ["A"], moeda: 7, grupoId: "g" };
    await r.tratar(pedido);
    expect(precosMassa).not.toHaveBeenCalled();
    agora += 61 * 60_000;
    await r.tratar(pedido);
    expect(precosMassa).toHaveBeenCalledTimes(1);
  });
});
