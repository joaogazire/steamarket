import { describe, expect, it } from "vitest";
import { REGRA_PADRAO } from "../core/tipos.ts";
import { lerAppDaPagina, lerAppDoHash, lerContexto } from "./contexto.ts";

describe("lerContexto", () => {
  const win = {
    g_steamID: "76561198000000000",
    g_sessionID: "abc123def456",
    g_bViewingOwnProfile: 1,
    g_rgWalletInfo: { wallet_currency: 7 },
    g_strCountryCode: "BR",
  };
  it("lê steamid, sessão, moeda, país e posse do inventário", () => {
    expect(lerContexto(win)).toEqual({
      steamid: "76561198000000000", sessionid: "abc123def456", moeda: 7, pais: "BR", proprio: true, regra: REGRA_PADRAO,
    });
  });
  it("lê a regra de taxas da carteira (valores podem vir como texto)", () => {
    const r = lerContexto({
      ...win,
      g_rgWalletInfo: { wallet_currency: 7, wallet_fee_percent: "0.05", wallet_publisher_fee_percent_default: "0.15", wallet_market_minimum: "1", wallet_currency_increment: "1" },
    });
    expect(r?.regra).toEqual({ taxaSteam: 0.05, taxaJogo: 0.15, minimo: 1, incremento: 1 });
  });
  it("regra inválida na carteira cai no padrão", () => {
    const r = lerContexto({ ...win, g_rgWalletInfo: { wallet_currency: 7, wallet_fee_percent: "lixo", wallet_currency_increment: "0" } });
    expect(r?.regra).toEqual(REGRA_PADRAO);
  });
  it("proprio aceita o booleano true que a Steam real entrega (captura 11/11/2026)", () => {
    expect(lerContexto({ ...win, g_bViewingOwnProfile: true })?.proprio).toBe(true);
    expect(lerContexto({ ...win, g_bViewingOwnProfile: false })?.proprio).toBe(false);
  });

  it("proprio é false em inventário alheio", () => {
    expect(lerContexto({ ...win, g_bViewingOwnProfile: 0 })?.proprio).toBe(false);
  });
  it("devolve null se faltar steamid ou sessão", () => {
    expect(lerContexto({ ...win, g_steamID: undefined })).toBeNull();
    expect(lerContexto({ ...win, g_sessionID: "" })).toBeNull();
  });
  it("devolve null para valores fora do formato", () => {
    expect(lerContexto({ ...win, g_steamID: "../x" })).toBeNull();
    expect(lerContexto({ ...win, g_rgWalletInfo: { wallet_currency: "x" } })).toBeNull();
  });
});

describe("lerAppDoHash", () => {
  it("extrai appid e contextid de #730_2", () => {
    expect(lerAppDoHash("#730_2")).toEqual({ appid: "730", contextid: "2" });
  });
  it("aceita #730 sem contexto (formato real da página): contexto 2, e 6 para o Steam (753)", () => {
    expect(lerAppDoHash("#730")).toEqual({ appid: "730", contextid: "2" });
    expect(lerAppDoHash("#753")).toEqual({ appid: "753", contextid: "6" });
  });
  it("devolve null para hash vazio ou estranho", () => {
    expect(lerAppDoHash("")).toBeNull();
    expect(lerAppDoHash("#abc")).toBeNull();
  });
});

describe("lerAppDaPagina (hash ou aba ativa)", () => {
  it("usa o hash quando válido", () => {
    document.body.innerHTML = "";
    expect(lerAppDaPagina(document, "#570_2")).toEqual({ appid: "570", contextid: "2" });
  });
  it("sem hash, usa a aba de jogo ativa", () => {
    document.body.innerHTML = `<a class="games_list_tab" href="#570"></a><a class="games_list_tab active" href="#730"></a>`;
    expect(lerAppDaPagina(document, "")).toEqual({ appid: "730", contextid: "2" });
  });
  it("sem hash e sem aba ativa devolve null", () => {
    document.body.innerHTML = "";
    expect(lerAppDaPagina(document, "")).toBeNull();
  });
});
