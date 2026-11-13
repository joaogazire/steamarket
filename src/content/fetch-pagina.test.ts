import { describe, expect, it, vi } from "vitest";
import { fetchDaPagina } from "./fetch-pagina.ts";

describe("fetchDaPagina (pedido sai da página: origem e Referer da Steam)", () => {
  it("repassa url e init sem o signal e devolve uma Response com status e corpo", async () => {
    const base = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
    const f = fetchDaPagina(base);
    const r = await f("https://steamcommunity.com/market/sellitem/", { method: "POST", body: "a=1", signal: AbortSignal.timeout(1000), credentials: "include" });
    expect(base).toHaveBeenCalledTimes(1);
    const init = (base.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init).toEqual({ method: "POST", body: "a=1", credentials: "include" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
  });
  it("tira cabeçalhos que o navegador ignora (Referer) e mantém os outros", async () => {
    const base = vi.fn(async () => new Response("", { status: 200 }));
    await fetchDaPagina(base)("https://x/", { headers: { Referer: "r", "Content-Type": "t" } });
    expect(((base.mock.calls[0] as unknown[])[1] as RequestInit).headers).toEqual({ "Content-Type": "t" });
  });
  it("status de erro passa adiante com o corpo", async () => {
    const r = await fetchDaPagina(async () => new Response("null", { status: 400 }))("https://x/");
    expect(r.status).toBe(400);
    expect(await r.text()).toBe("null");
  });
  it("demora além do limite vira TypeError (falha de rede)", async () => {
    const f = fetchDaPagina(() => new Promise<Response>(() => undefined), 10);
    await expect(f("https://x/")).rejects.toBeInstanceOf(TypeError);
  });
});
