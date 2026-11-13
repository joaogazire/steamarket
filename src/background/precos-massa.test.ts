import { describe, expect, it, vi } from "vitest";
import { ErroFormato, ErroRede } from "../steam/cliente.ts";
import { URL_PRECOS, URL_TAXAS, baixarTabela, centavosPara, moedaIso, precoUsd } from "./precos-massa.ts";

const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe("precoUsd", () => {
  it("prefere a média de 7 dias e cai para 24 h, 30 d e 90 d", () => {
    expect(precoUsd({ last_24h: 0.5, last_7d: 0.4, last_30d: 0.3, last_90d: 0.2 })).toBe(0.4);
    expect(precoUsd({ last_24h: 0.5, last_7d: null, last_30d: 0.3 })).toBe(0.5);
    expect(precoUsd({ last_24h: null, last_7d: null, last_30d: 3.23, last_90d: 3.23 })).toBe(3.23);
  });
  it("rejeita valores que não são números positivos", () => {
    expect(precoUsd({ last_7d: -1, last_24h: "2", last_30d: Infinity, last_90d: 0 })).toBeNull();
    expect(precoUsd(null)).toBeNull();
    expect(precoUsd("x")).toBeNull();
  });
});

describe("moedaIso", () => {
  it("traduz o código de moeda da Steam", () => {
    expect(moedaIso(7)).toBe("BRL");
    expect(moedaIso(1)).toBe("USD");
    expect(moedaIso(3)).toBe("EUR");
    expect(moedaIso(999)).toBeNull();
  });
});

describe("centavosPara", () => {
  const tabela = {
    precos: { "MP9 | Pine (Field-Tested)": { last_7d: 0.03 }, Caixa: { last_7d: 0.38 }, Nada: { last_7d: null } },
    taxas: { USD: 1, BRL: 5.5621 },
  };
  it("converte de USD para a moeda da carteira, em centavos", () => {
    expect(centavosPara(["Caixa", "MP9 | Pine (Field-Tested)"], tabela, 7)).toEqual({ Caixa: 211, "MP9 | Pine (Field-Tested)": 17 });
  });
  it("omite nomes sem preço ou desconhecidos, sem cair em propriedades herdadas", () => {
    expect(centavosPara(["Nada", "Outro", "__proto__", "toString", "constructor"], tabela, 7)).toEqual({});
  });
  it("moeda sem câmbio na tabela não devolve nada", () => {
    expect(centavosPara(["Caixa"], tabela, 3)).toEqual({});
  });
});

describe("baixarTabela", () => {
  it("baixa preços e câmbio sem mandar cookies", async () => {
    const f = vi.fn(async (url: string) => (url === URL_PRECOS ? resp({ A: { last_7d: 1 } }) : resp({ USD: 1, BRL: 5 })));
    const t = await baixarTabela(f as unknown as typeof fetch);
    expect(t).toEqual({ precos: { A: { last_7d: 1 } }, taxas: { USD: 1, BRL: 5 } });
    expect(f.mock.calls.map((c) => c[0]).sort()).toEqual([URL_TAXAS, URL_PRECOS].sort());
    for (const c of f.mock.calls) expect((c as unknown[])[1]).toMatchObject({ credentials: "omit" });
  });
  it("status de erro ou corpo que não é objeto vira ErroFormato", async () => {
    await expect(baixarTabela((async () => resp({}, 503)) as unknown as typeof fetch)).rejects.toBeInstanceOf(ErroFormato);
    await expect(baixarTabela((async () => resp([1, 2])) as unknown as typeof fetch)).rejects.toBeInstanceOf(ErroFormato);
  });
  it("falha de rede vira ErroRede", async () => {
    await expect(baixarTabela((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(ErroRede);
  });
});
