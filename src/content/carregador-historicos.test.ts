import { describe, expect, it, vi } from "vitest";
import type { Resposta } from "../background/roteador.ts";
import { criarCarregador, type Pedido } from "./carregador-historicos.ts";

const ok = (): Resposta => ({ ok: true, dados: [{ t: 1, preco: 100, volume: 1 }] }) as Resposta;
const erro = (e: string): Resposta => ({ ok: false, erro: e, mensagem: e }) as Resposta;

function montar(pagina: string[], todas: string[], resp: (p: Pedido, n: number) => Resposta = () => ok()) {
  const historicos = new Map<string, unknown>();
  const pedidos: Pedido[] = [];
  const esperas: number[] = [];
  const parou = vi.fn();
  const c = criarCarregador({
    pedir: async (p) => {
      pedidos.push(p);
      return resp(p, pedidos.length);
    },
    esperar: async (ms) => void esperas.push(ms),
    tem: (k) => historicos.has(k),
    chavesDaPagina: () => pagina,
    chavesTodas: () => todas,
    aoCarregar: (k, h) => void historicos.set(k, h),
    aoParar: parou,
  });
  return { c, historicos, pedidos, esperas, parou };
}

describe("carregador de históricos do mercado (todas as listagens)", () => {
  it("anúncios de outras páginas vão com appid em texto (o background recusa número)", async () => {
    const { c, pedidos, historicos } = montar([], ["730:AWP | Duality (Field-Tested)"]);
    await c.rodar();
    expect(pedidos).toEqual([{ appid: "730", nome: "AWP | Duality (Field-Tested)" }]);
    expect(historicos.get("730:AWP | Duality (Field-Tested)")).toEqual([{ t: 1, preco: 100, volume: 1 }]);
  });
  it("nome com ':' fica inteiro (corta só no primeiro)", async () => {
    const { c, pedidos } = montar([], ["753:200170-Item: Edição"]);
    await c.rodar();
    expect(pedidos[0]).toEqual({ appid: "753", nome: "200170-Item: Edição" });
  });
  it("primeiro os da página, depois os demais, sem pedir o mesmo item duas vezes", async () => {
    const { c, pedidos } = montar(["730:B", "730:A"], ["730:A", "730:C", "730:B"]);
    await Promise.all([c.rodar(), c.rodar()]);
    expect(pedidos.map((p) => p.nome)).toEqual(["B", "A", "C"]);
  });
  it("no limite da Steam espera e tenta o mesmo item de novo, sem marcar 'sem histórico'", async () => {
    const { c, pedidos, historicos, esperas } = montar([], ["730:A"], (_p, n) => (n === 1 ? erro("limite") : ok()));
    await c.rodar();
    expect(pedidos.map((p) => p.nome)).toEqual(["A", "A"]);
    expect(esperas).toEqual([60_000]);
    expect(historicos.get("730:A")).not.toBeNull();
  });
  it("limite seguido demais: para e avisa (o que falta não vira 'sem histórico')", async () => {
    const { c, historicos, parou } = montar([], ["730:A"], () => erro("limite"));
    await c.rodar();
    expect(historicos.has("730:A")).toBe(false);
    expect(parou).toHaveBeenCalledWith("limite");
  });
  it("sem sessão: para na hora", async () => {
    const { c, pedidos, parou } = montar([], ["730:A", "730:B"], () => erro("sessao"));
    await c.rodar();
    expect(pedidos).toHaveLength(1);
    expect(parou).toHaveBeenCalledWith("sessao");
  });
  it("outro erro do item: fica sem histórico e segue para o próximo", async () => {
    const { c, historicos } = montar([], ["730:A", "730:B"], (p) => (p.nome === "A" ? erro("rede") : ok()));
    await c.rodar();
    expect(historicos.get("730:A")).toBeNull();
    expect(historicos.get("730:B")).not.toBeNull();
  });
  it("chave sem formato appid:nome é ignorada (sem pedido)", async () => {
    const { c, pedidos, historicos } = montar([], ["abc:X", "semdoispontos"]);
    await c.rodar();
    expect(pedidos).toHaveLength(0);
    expect(historicos.get("abc:X")).toBeNull();
  });
});
