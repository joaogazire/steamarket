import { describe, expect, it, vi } from "vitest";
import { montarPainel } from "./painel.ts";

const ctx = (proprio: boolean) => ({ steamid: "76561198000000000", sessionid: "abc", moeda: 7, pais: "BR", proprio });

describe("montarPainel INV-01 / edge", () => {
  it("em inventário alheio não monta nada", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    expect(montarPainel(document, ctx(false), vi.fn())).toBeNull();
    expect(document.querySelector("#sv-painel")).toBeNull();
  });
  it("no próprio inventário monta o painel uma só vez", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    const a = montarPainel(document, ctx(true), vi.fn());
    const b = montarPainel(document, ctx(true), vi.fn());
    expect(a).not.toBeNull();
    expect(document.querySelectorAll("#sv-painel")).toHaveLength(1);
    expect(b).toBe(a);
  });
  it("trocar de jogo cancela as requisições do grupo anterior", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    const enviar = vi.fn();
    const p = montarPainel(document, ctx(true), enviar)!;
    p.trocarJogo("730_2");
    p.trocarJogo("570_2");
    expect(enviar).toHaveBeenCalledWith({ tipo: "cancelar", grupoId: "730_2" });
    expect(p.jogoAtual()).toBe("570_2");
  });
});
