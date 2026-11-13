import { describe, expect, it, vi } from "vitest";
import { esperarInventarioDaPagina, lerInventarioDaPagina } from "./inventario-pagina.ts";

// Formato do CInventory em economy_v2.js da Steam: m_rgAssets é um array usado como mapa assetid → asset,
// e o item à venda vem com description.sealed && sealed_type == 1 ("On Market").
function inv(contextid: string, assets: Record<string, unknown>, completo = true) {
  const m_rgAssets: unknown[] & Record<string, unknown> = Object.assign([], assets);
  return { appid: 730, contextid, m_bFullyLoaded: completo, m_rgAssets };
}
const asset = (assetid: string, contextid: string, nome: string, extra: Record<string, unknown> = {}) => ({
  assetid, appid: 730, contextid, amount: "1",
  description: { market_hash_name: nome, marketable: 1, ...extra },
});

describe("lerInventarioDaPagina", () => {
  it("lê os itens de um CInventory simples", () => {
    const r = lerInventarioDaPagina(inv("2", { "11": asset("11", "2", "MP9 | Pine (Field-Tested)") }));
    expect(r).toEqual({
      completo: true,
      ativos: [{ assetid: "11", appid: 730, contextid: "2", market_hash_name: "MP9 | Pine (Field-Tested)", marketable: true, listado: false }],
    });
  });

  it("marca como listado o item com sealed e sealed_type 1 (On Market)", () => {
    const r = lerInventarioDaPagina(inv("2", { "11": asset("11", "2", "Caixa", { sealed: 1, sealed_type: 1, marketable: 0 }) }));
    expect(r?.ativos[0]?.listado).toBe(true);
  });

  it("item só selado (sealed_type diferente de 1) não é listado", () => {
    const r = lerInventarioDaPagina(inv("2", { "11": asset("11", "2", "Caixa", { sealed: 1, sealed_type: 2 }) }));
    expect(r?.ativos[0]?.listado).toBe(false);
  });

  it("junta os contextos de um CAppwideInventory (CS2 tem 2 e 16) e só fica completo quando todos ficam", () => {
    const r = lerInventarioDaPagina({
      appid: 730,
      m_bFullyLoaded: false,
      m_rgChildInventories: {
        2: inv("2", { "11": asset("11", "2", "A") }),
        16: inv("16", { "22": asset("22", "16", "B") }, false),
      },
    });
    expect(r?.ativos.map((a) => `${a.contextid}_${a.assetid}`).sort()).toEqual(["16_22", "2_11"]);
    expect(r?.completo).toBe(false);
  });

  it("usa appid/contextid do inventário quando o asset não traz", () => {
    const r = lerInventarioDaPagina(inv("2", { "11": { assetid: "11", description: { market_hash_name: "A", marketable: true } } }));
    expect(r?.ativos[0]).toMatchObject({ appid: 730, contextid: "2", marketable: true });
  });

  it("ignora assets malformados ou sem descrição", () => {
    const r = lerInventarioDaPagina(inv("2", {
      "11": asset("11", "2", "A"),
      "x": { assetid: "abc", description: { market_hash_name: "B" } },
      "12": { assetid: "12" },
      "13": asset("13", "2", ""),
    }));
    expect(r?.ativos.map((a) => a.assetid)).toEqual(["11"]);
  });

  it("devolve null para o que não parece inventário", () => {
    expect(lerInventarioDaPagina(null)).toBeNull();
    expect(lerInventarioDaPagina({})).toBeNull();
    expect(lerInventarioDaPagina({ m_rgAssets: "x" })).toBeNull();
  });
});

describe("esperarInventarioDaPagina", () => {
  const dormir = vi.fn(async () => undefined);

  it("pede à página para carregar tudo e espera ficar completo", async () => {
    const carregarTudo = vi.fn();
    let chamadas = 0;
    const alvo = inv("2", { "11": asset("11", "2", "A") }, false);
    const obter = () => {
      if (++chamadas === 3) alvo.m_bFullyLoaded = true;
      return { ...alvo, LoadCompleteInventory: carregarTudo };
    };
    const r = await esperarInventarioDaPagina(obter, "730", { dormir, tentativas: 10 });
    expect(carregarTudo).toHaveBeenCalledTimes(1);
    expect(r?.completo).toBe(true);
    expect(chamadas).toBe(3);
  });

  it("espera o inventário ativo ser o do jogo pedido", async () => {
    let chamadas = 0;
    const obter = () => (++chamadas < 2 ? { ...inv("2", {}), appid: 440 } : inv("2", { "11": asset("11", "2", "A") }));
    const r = await esperarInventarioDaPagina(obter, "730", { dormir, tentativas: 10 });
    expect(r?.ativos).toHaveLength(1);
  });

  it("desiste depois das tentativas e devolve o que leu (incompleto) ou null", async () => {
    const parcial = await esperarInventarioDaPagina(() => inv("2", { "11": asset("11", "2", "A") }, false), "730", { dormir, tentativas: 3 });
    expect(parcial).toMatchObject({ completo: false });
    expect(await esperarInventarioDaPagina(() => undefined, "730", { dormir, tentativas: 3 })).toBeNull();
  });

  it("erro ao chamar LoadCompleteInventory não derruba a leitura", async () => {
    const obter = () => ({ ...inv("2", { "11": asset("11", "2", "A") }), LoadCompleteInventory: () => { throw new Error("x"); } });
    expect((await esperarInventarioDaPagina(obter, "730", { dormir, tentativas: 2 }))?.completo).toBe(true);
  });
});
