import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { abrirCache } from "./cache.ts";

let n = 0;
const novoNome = () => `teste-${n++}`;

describe("cache PRC-02", () => {
  it("devolve o valor guardado dentro da validade", async () => {
    let agora = 1000;
    const c = await abrirCache(novoNome(), () => agora);
    await c.guardar("k", { x: 1 });
    agora += 3_599_000;
    expect(await c.obter("k", 3_600_000)).toEqual({ x: 1 });
  });
  it("não devolve valor expirado", async () => {
    let agora = 1000;
    const c = await abrirCache(novoNome(), () => agora);
    await c.guardar("k", "v");
    agora += 300_001;
    expect(await c.obter("k", 300_000)).toBeUndefined();
  });
  it("devolve undefined para chave inexistente", async () => {
    const c = await abrirCache(novoNome());
    expect(await c.obter("nada", 1000)).toBeUndefined();
  });
  it("ttl infinito nunca expira (item_nameid)", async () => {
    let agora = 1000;
    const c = await abrirCache(novoNome(), () => agora);
    await c.guardar("id", "123");
    agora += 10 ** 12;
    expect(await c.obter("id", Infinity)).toBe("123");
  });
  it("guardar de novo substitui o valor e renova a validade", async () => {
    let agora = 1000;
    const c = await abrirCache(novoNome(), () => agora);
    await c.guardar("k", "velho");
    agora += 200_000;
    await c.guardar("k", "novo");
    agora += 200_000;
    expect(await c.obter("k", 300_000)).toBe("novo");
  });
});
