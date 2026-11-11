import { describe, expect, it } from "vitest";
import { exigirSessao, temSessao, validarArgs } from "./capturar.ts";

// FIX-03: sem sessão logada o script aborta com "sessão Steam ausente".
describe("temSessao", () => {
  it("aceita cookie com steamLoginSecure e sessionid", () => {
    expect(temSessao("sessionid=abc; steamLoginSecure=765%7C%7Cxyz")).toBe(true);
  });
  it("recusa cookie sem steamLoginSecure", () => {
    expect(temSessao("sessionid=abc")).toBe(false);
  });
  it("recusa cookie vazio ou indefinido", () => {
    expect(temSessao("")).toBe(false);
    expect(temSessao(undefined)).toBe(false);
  });
});

describe("exigirSessao", () => {
  it("lança 'sessão Steam ausente' sem sessão", () => {
    expect(() => exigirSessao("")).toThrow("sessão Steam ausente");
  });
  it("devolve o cookie quando há sessão", () => {
    const c = "sessionid=abc; steamLoginSecure=1";
    expect(exigirSessao(c)).toBe(c);
  });
});

// Entrada vinda do argv não pode alterar o caminho da requisição feita com o cookie.
describe("validarArgs", () => {
  it("aceita steamid64, appid e contextid numéricos", () => {
    expect(validarArgs("76561198000000000", "730", "2")).toEqual({ steamid: "76561198000000000", appid: "730", contextid: "2" });
  });
  it("recusa valores com caminho ou texto", () => {
    expect(() => validarArgs("../market/x?", "730", "2")).toThrow("argumentos inválidos");
    expect(() => validarArgs("76561198000000000", "73a", "2")).toThrow("argumentos inválidos");
    expect(() => validarArgs("76561198000000000", "730", "")).toThrow("argumentos inválidos");
    expect(() => validarArgs(undefined, "730", "2")).toThrow("argumentos inválidos");
  });
});
