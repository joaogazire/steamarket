import { describe, expect, it } from "vitest";
import { lerAppDoHash, lerContexto } from "./contexto.ts";

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
      steamid: "76561198000000000", sessionid: "abc123def456", moeda: 7, pais: "BR", proprio: true,
    });
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
  it("devolve null para hash vazio ou estranho", () => {
    expect(lerAppDoHash("")).toBeNull();
    expect(lerAppDoHash("#abc")).toBeNull();
  });
});
