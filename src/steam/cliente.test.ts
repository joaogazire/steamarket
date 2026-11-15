import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ErroLimite } from "../background/fila.ts";
import {
  ErroFormato, ErroRede, ErroSessao, anuncios, historico, inventario, itemNameId, ordens, removerAnuncio, textoParaCentavos, vender, visaoGeral,
} from "./cliente.ts";

const ler = (c: string) => readFileSync(c, "utf8");
const json = (c: string, status = 200) => new Response(ler(c), { status });
const resp = (corpo: unknown, status = 200) => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });
const fetcher = (...respostas: Response[]) => {
  const fn = vi.fn();
  respostas.forEach((r) => fn.mockResolvedValueOnce(r));
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>;
};

describe("textoParaCentavos", () => {
  it("converte textos de preço de várias moedas", () => {
    expect(textoParaCentavos("R$ 25,77")).toBe(2577);
    expect(textoParaCentavos("$4.62")).toBe(462);
    expect(textoParaCentavos("R$ 1.234,50")).toBe(123450);
    expect(textoParaCentavos("1,234.56")).toBe(123456);
  });
  it("devolve null para texto sem número", () => {
    expect(textoParaCentavos("")).toBeNull();
    expect(textoParaCentavos(undefined)).toBeNull();
    expect(textoParaCentavos("abc")).toBeNull();
  });
});

describe("inventario INV-02 / INV-04", () => {
  it("concatena as páginas e junta asset com descrição", async () => {
    const f = fetcher(json("fixtures/sinteticas/inventario-p1.json"), json("fixtures/sinteticas/inventario-p2.json"));
    const r = await inventario(f, "76561198000000000", "730", "2");
    expect(r.map((a) => a.assetid)).toEqual(["100", "200", "300"]);
    expect(r[0]).toEqual({ assetid: "100", appid: 730, contextid: "2", market_hash_name: "Caixa Sintetica", marketable: true });
    expect(r[2]?.marketable).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1]?.[0])).toContain("start_assetid=200");
  });
  it("recusa resposta fora do formato", async () => {
    await expect(inventario(fetcher(resp({ success: 1 })), "76561198000000000", "730", "2")).rejects.toBeInstanceOf(ErroFormato);
  });
  it("429 vira ErroLimite; 401 e 403 viram ErroSessao", async () => {
    await expect(inventario(fetcher(resp("", 429)), "76561198000000000", "730", "2")).rejects.toBeInstanceOf(ErroLimite);
    await expect(inventario(fetcher(resp("", 401)), "76561198000000000", "730", "2")).rejects.toBeInstanceOf(ErroSessao);
    await expect(inventario(fetcher(resp("", 403)), "76561198000000000", "730", "2")).rejects.toBeInstanceOf(ErroSessao);
  });
  it("falha de rede vira ErroRede", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
    await expect(inventario(f, "76561198000000000", "730", "2")).rejects.toBeInstanceOf(ErroRede);
  });
});

describe("historico / visaoGeral / ordens / itemNameId PRC-01", () => {
  it("historico lê a série em centavos", async () => {
    const r = await historico(fetcher(json("fixtures/sinteticas/pricehistory.json")), "730", "Caixa Sintetica");
    expect(r.map((p) => p.preco)).toEqual([2450, 2510, 2577]);
    expect(r.map((p) => p.volume)).toEqual([31, 12, 7]);
  });
  it("historico sem login (400) vira ErroSessao", async () => {
    await expect(historico(fetcher(resp("[]", 400)), "730", "x")).rejects.toBeInstanceOf(ErroSessao);
  });
  it("visaoGeral usa a resposta real do priceoverview", async () => {
    const r = await visaoGeral(fetcher(json("fixtures/real/priceoverview-chroma2.json")), "730", "Chroma 2 Case", 7);
    expect(r).toEqual({ menorAnuncio: 2577, mediana: 2577, volume: 1989 });
  });
  it("visaoGeral com success=false vira ErroFormato", async () => {
    await expect(visaoGeral(fetcher(resp({ success: false })), "730", "x", 7)).rejects.toBeInstanceOf(ErroFormato);
  });
  it("ordens devolve centavos; campo ausente vira null", async () => {
    const r = await ordens(fetcher(json("fixtures/sinteticas/ordens.json")), "12345", 7, "BR");
    expect(r).toEqual({ maiorOrdemCompra: 2300, menorAnuncio: 2577 });
    const vazio = await ordens(fetcher(resp({ success: 1 })), "12345", 7, "BR");
    expect(vazio).toEqual({ maiorOrdemCompra: null, menorAnuncio: null });
  });
  it("itemNameId extrai o número da página do item", async () => {
    const f = fetcher(resp("<script>Market_LoadOrderSpread( 98765 );</script>"));
    expect(await itemNameId(f, "730", "Caixa Sintetica")).toBe("98765");
    await expect(itemNameId(fetcher(resp("<html></html>")), "730", "x")).rejects.toBeInstanceOf(ErroFormato);
  });
});

describe("vender", () => {
  const ctx = { sessionid: "abc123", steamid: "76561198000000000" };
  const ativo = { assetid: "100", appid: 730, contextid: "2", market_hash_name: "x", marketable: true };

  it("envia POST com o líquido em centavos inteiros e o Referer do inventário", async () => {
    const f = fetcher(resp({ success: true, requires_confirmation: 1 }));
    const r = await vender(f, ctx, ativo, 1234);
    expect(r).toEqual({ ok: true, precisaConfirmar: true });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://steamcommunity.com/market/sellitem/");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    const corpo = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(corpo)).toEqual({
      sessionid: "abc123", appid: "730", contextid: "2", assetid: "100", amount: "1", price: "1234",
    });
    expect((init.headers as Record<string, string>).Referer).toBe("https://steamcommunity.com/profiles/76561198000000000/inventory");
  });
  it("a venda tem tempo limite (AbortSignal), para um lote nunca ficar pendurado", async () => {
    const f = fetcher(resp({ success: true }));
    await vender(f, ctx, ativo, 500);
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("recusa devolve o motivo da Steam", async () => {
    const r = await vender(fetcher(resp({ success: false, message: "Você já tem um anúncio" })), ctx, ativo, 500);
    expect(r).toEqual({ ok: false, motivo: "Você já tem um anúncio" });
  });
  it("não envia nada se o preço não é inteiro positivo", async () => {
    const f = fetcher();
    await expect(vender(f, ctx, ativo, 12.5)).rejects.toThrow("preço");
    await expect(vender(f, ctx, ativo, 0)).rejects.toThrow("preço");
    expect(f).not.toHaveBeenCalled();
  });
  it("sessão expirada vira ErroSessao; 429 vira ErroLimite", async () => {
    await expect(vender(fetcher(resp("", 401)), ctx, ativo, 500)).rejects.toBeInstanceOf(ErroSessao);
    await expect(vender(fetcher(resp("", 429)), ctx, ativo, 500)).rejects.toBeInstanceOf(ErroLimite);
  });
});

describe("vender: erro HTTP com motivo da Steam (venda real 11/11/2026 deu 400)", () => {
  const ctx = { sessionid: "abc123", steamid: "76561198000000000" };
  const ativo = { assetid: "100", appid: 730, contextid: "2", market_hash_name: "x", marketable: true };
  it("400 com JSON de recusa devolve o motivo em vez de erro genérico", async () => {
    const r = await vender(fetcher(resp({ success: false, message: "There was a problem listing your item." }, 400)), ctx, ativo, 500);
    expect(r).toEqual({ ok: false, motivo: "There was a problem listing your item. (status 400)" });
  });
  it("400 sem corpo legível continua ErroFormato com o status", async () => {
    await expect(vender(fetcher(resp("null", 400)), ctx, ativo, 500)).rejects.toThrow("status 400");
  });
});

describe("vender: faixa de preço", () => {
  it("recusa preço acima do teto sem enviar", async () => {
    const f = fetcher();
    const ctx = { sessionid: "abc123", steamid: "76561198000000000" };
    const ativo = { assetid: "100", appid: 730, contextid: "2", market_hash_name: "x", marketable: true };
    await expect(vender(f, ctx, ativo, 10_000_001)).rejects.toThrow("faixa");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("anuncios (/market/mylistings, formato real de 11/11/2026)", () => {
  it("devolve, por id de quadrado appid_contexto_assetid, o preço anunciado em centavos", async () => {
    const r = await anuncios(fetcher(json("fixtures/real/mylistings-estrutura.json")), "730", 0);
    expect(r.total).toBe(3);
    expect(r.itens).toEqual({ "730_2_900000001": 3500, "730_2_900000002": 123450 });
  });
  it("só inclui o app pedido", async () => {
    const r = await anuncios(fetcher(json("fixtures/real/mylistings-estrutura.json")), "753", 0);
    expect(r.itens).toEqual({ "753_6_900000003": 7 });
  });
  it("sem preço legível, o item continua listado com preço null", async () => {
    const d = JSON.parse(readFileSync("fixtures/real/mylistings-estrutura.json", "utf8"));
    d.results_html = "<div id=\"mylisting_111\">sem preço</div>";
    const r = await anuncios(fetcher(resp(JSON.stringify(d))), "730", 0);
    expect(r.itens["730_2_900000001"]).toBeNull();
  });
  it("sem login (400) vira ErroSessao; sem success vira ErroFormato; parâmetros inválidos são recusados", async () => {
    await expect(anuncios(fetcher(resp("[]", 400)), "730", 0)).rejects.toBeInstanceOf(ErroSessao);
    await expect(anuncios(fetcher(resp('{"success":false}')), "730", 0)).rejects.toBeInstanceOf(ErroFormato);
    await expect(anuncios(fetcher(resp("{}")), "73x", 0)).rejects.toBeInstanceOf(ErroFormato);
    await expect(anuncios(fetcher(resp("{}")), "730", -1)).rejects.toBeInstanceOf(ErroFormato);
  });
  it("assetid ou contexto fora do formato no texto de hovers é ignorado", async () => {
    const d = JSON.parse(readFileSync("fixtures/real/mylistings-estrutura.json", "utf8"));
    d.hovers = "CreateItemHoverFromContainer( g_rgAssets, 'mylisting_1_name', 730, '2', '<script>', 1 );";
    const r = await anuncios(fetcher(resp(JSON.stringify(d))), "730", 0);
    expect(r.itens).toEqual({});
  });
});

describe("inventario: Steam responde 500 para páginas grandes", () => {
  it("repete com página menor e acaba lendo o inventário", async () => {
    const f = fetcher(resp("", 500), json("fixtures/sinteticas/inventario-p1.json"), json("fixtures/sinteticas/inventario-p2.json"));
    const r = await inventario(f, "76561198000000000", "730", "2");
    expect(r.length).toBeGreaterThan(0);
    const urls = (f as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain("count=2000");
    expect(urls[1]).toContain("count=500");
    expect(urls[2]).toContain("count=500");
  });
  it("desiste (ErroFormato) se até a menor página dá 500", async () => {
    const f = fetcher(resp("", 500), resp("", 500), resp("", 500));
    await expect(inventario(f, "76561198000000000", "730", "2")).rejects.toBeInstanceOf(ErroFormato);
  });
});

describe("removerAnuncio", () => {
  const ctx = { sessionid: "abc123", steamid: "76561198000000000" };
  it("POST em /market/removelisting/<id> com a sessão no corpo", async () => {
    const f = fetcher(resp([]));
    await removerAnuncio(f, ctx, "7654321");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://steamcommunity.com/market/removelisting/7654321");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ sessionid: "abc123" });
  });
  it("id que não é só dígitos não envia nada", async () => {
    const f = fetcher();
    await expect(removerAnuncio(f, ctx, "12/../x")).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it("401 vira ErroSessao; erro HTTP vira ErroFormato", async () => {
    await expect(removerAnuncio(fetcher(resp("", 401)), ctx, "1")).rejects.toBeInstanceOf(ErroSessao);
    await expect(removerAnuncio(fetcher(resp("", 500)), ctx, "1")).rejects.toThrow("status 500");
  });
});
