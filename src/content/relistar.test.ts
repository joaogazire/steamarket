import { describe, expect, it, vi } from "vitest";
import { REGRA_PADRAO, type Ativo } from "../core/tipos.ts";
import { relistarAnuncio, type DepsRelistar } from "./relistar.ts";

const ativo = (id: string, nome = "Item X", marketable = true): Ativo => ({ assetid: id, appid: 730, contextid: "2", market_hash_name: nome, marketable });

function deps(sobre: Partial<DepsRelistar> = {}): DepsRelistar & { chamadas: string[] } {
  const chamadas: string[] = [];
  const d: DepsRelistar = {
    regra: REGRA_PADRAO,
    travar: true,
    menorAnuncio: vi.fn(async () => (chamadas.push("menor"), 100)),
    remover: vi.fn(async () => void chamadas.push("remover")),
    // 1ª leitura (antes de remover): sem a cópia anunciada; depois ela volta como assetid novo
    inventario: vi.fn(async () => (chamadas.push("inventario"), chamadas.filter((c) => c === "inventario").length === 1 ? [ativo("9", "Outro")] : [ativo("9", "Outro"), ativo("42")])),
    vender: vi.fn(async () => (chamadas.push("vender"), { ok: true as const, precisaConfirmar: false })),
    esperar: vi.fn(async () => undefined),
    // o anúncio existe e é deste item antes de remover; depois some
    anuncio: vi.fn(async () => (chamadas.push("anuncio"), chamadas.includes("remover") ? null : "730:Item X")),
    ...sobre,
  };
  return Object.assign(d, { chamadas });
}
const pedido = { listingId: "555", appid: "730", nome: "Item X", preco: 110, fonte: "steam" as const };

describe("relistarAnuncio", () => {
  it("confere o mercado, remove, acha o item no inventário e lista pelo líquido do preço sugerido", async () => {
    const d = deps();
    const r = await relistarAnuncio(d, pedido);
    expect(r).toEqual({ ok: true, precisaConfirmar: false });
    expect(d.chamadas).toEqual(["menor", "anuncio", "inventario", "remover", "anuncio", "inventario", "vender"]);
    expect(d.remover).toHaveBeenCalledWith("555");
    const [ativoVendido, liquido] = (d.vender as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(ativoVendido.assetid).toBe("42");
    expect(liquido).toBeGreaterThan(0);
    expect(liquido).toBeLessThan(110);
  });
  it("trava de preço barra ANTES de remover (o anúncio atual fica como está)", async () => {
    const d = deps({ menorAnuncio: vi.fn(async () => 20) }); // 110 > 2× 20
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.remover).not.toHaveBeenCalled();
  });
  it("trava desligada pelo usuário lista mesmo assim", async () => {
    const d = deps({ menorAnuncio: vi.fn(async () => 20), travar: false });
    expect((await relistarAnuncio(d, pedido)).ok).toBe(true);
    expect(d.remover).toHaveBeenCalled();
  });
  it("falha ao conferir o mercado: não remove", async () => {
    const d = deps({ menorAnuncio: vi.fn(async () => { throw new Error("rede"); }) });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.remover).not.toHaveBeenCalled();
  });
  it("falha ao remover: não tenta listar", async () => {
    const d = deps({ remover: vi.fn(async () => { throw new Error("400"); }) });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.vender).not.toHaveBeenCalled();
  });
  it("item demora a voltar ao inventário: tenta de novo algumas vezes", async () => {
    let n = 0;
    const d = deps({ inventario: vi.fn(async () => (++n < 4 ? [] : [ativo("42")])) });
    expect((await relistarAnuncio(d, pedido)).ok).toBe(true);
    expect(d.inventario).toHaveBeenCalledTimes(4); // 1 antes de remover + 3 depois
  });
  it("anúncio continua ativo e nada volta: não lista nada nem diz que removeu", async () => {
    const d = deps({ inventario: vi.fn(async () => []), anuncio: vi.fn(async () => "730:Item X") });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect((r as { removido?: boolean }).removido).toBeFalsy();
    expect(d.vender).not.toHaveBeenCalled();
  });
  it("code-review: com outra cópia do mesmo item já no inventário, lista só a que voltou do anúncio", async () => {
    let n = 0;
    const d = deps({ inventario: vi.fn(async () => (++n === 1 ? [ativo("7")] : [ativo("7"), ativo("42")])) });
    expect((await relistarAnuncio(d, pedido)).ok).toBe(true);
    expect((d.vender as ReturnType<typeof vi.fn>).mock.calls[0]![0].assetid).toBe("42");
  });
  it("code-review: anúncio vendido antes do clique e outra cópia no inventário: não lista a outra cópia", async () => {
    const d = deps({ inventario: vi.fn(async () => [ativo("7")]) });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.vender).not.toHaveBeenCalled();
  });
  it("segurança: o anúncio da linha é de outro item (DOM desalinhado): não remove", async () => {
    const d = deps({ anuncio: vi.fn(async () => "730:Outro") });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.remover).not.toHaveBeenCalled();
  });
  it("segurança: anúncio já não existe (vendido): não remove nem lista", async () => {
    const d = deps({ anuncio: vi.fn(async () => null) });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.remover).not.toHaveBeenCalled();
    expect(d.vender).not.toHaveBeenCalled();
  });
  it("segurança: remoção aceita sem efeito (anúncio continua ativo) e outra cópia aparece: não lista", async () => {
    let n = 0;
    const d = deps({
      anuncio: vi.fn(async () => "730:Item X"),
      inventario: vi.fn(async () => (++n === 1 ? [] : [ativo("42")])),
    });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.vender).not.toHaveBeenCalled();
  });
  it("code-review: um 429 no inventário depois de remover não acaba com as tentativas", async () => {
    let n = 0;
    const d = deps({
      inventario: vi.fn(async () => {
        n++;
        if (n === 2) throw new Error("429");
        return n === 1 ? [] : [ativo("42")];
      }),
    });
    expect((await relistarAnuncio(d, pedido)).ok).toBe(true);
  });
  it("code-review: anúncio saiu mas o item não voltou a tempo: marca removido (a linha não parece ativa)", async () => {
    const d = deps({ inventario: vi.fn(async () => []) }); // anúncio some depois de remover (padrão), item não aparece
    const r = await relistarAnuncio(d, pedido);
    expect(r).toMatchObject({ ok: false, removido: true });
  });
  it("falha ao conferir os anúncios: não remove", async () => {
    const d = deps({ anuncio: vi.fn(async () => { throw new Error("429"); }) });
    expect((await relistarAnuncio(d, pedido)).ok).toBe(false);
    expect(d.remover).not.toHaveBeenCalled();
  });
  it("falha ao ler o inventário antes de remover: não remove", async () => {
    const d = deps({ inventario: vi.fn(async () => { throw new Error("429"); }) });
    const r = await relistarAnuncio(d, pedido);
    expect(r.ok).toBe(false);
    expect(d.remover).not.toHaveBeenCalled();
  });
  it("Steam recusa a nova listagem: devolve o motivo e marca removido", async () => {
    const d = deps({ vender: vi.fn(async () => ({ ok: false as const, motivo: "preço baixo" })) });
    const r = await relistarAnuncio(d, pedido);
    expect(r).toMatchObject({ ok: false, removido: true });
    expect((r as { motivo: string }).motivo).toContain("preço baixo");
  });
  it("ignora itens não vendáveis ou de outro nome", async () => {
    let n = 0;
    const d = deps({ inventario: vi.fn(async () => (++n === 1 ? [] : [ativo("1", "Item X", false), ativo("2", "Outro"), ativo("3")])) });
    await relistarAnuncio(d, pedido);
    expect((d.vender as ReturnType<typeof vi.fn>).mock.calls[0]![0].assetid).toBe("3");
  });
});
