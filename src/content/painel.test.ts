import { describe, expect, it, vi } from "vitest";
import { REGRA_PADRAO } from "../core/tipos.ts";
import { montarPainel, posicionar } from "./painel.ts";

const ctx = (proprio: boolean) => ({ steamid: "76561198000000000", sessionid: "abc", moeda: 7, pais: "BR", proprio, regra: REGRA_PADRAO });

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
  it("o conteúdo fica num shadow root fechado, fora do alcance da página", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    montarPainel(document, ctx(true), vi.fn());
    const host = document.querySelector("#sv-painel") as HTMLElement;
    expect(host.shadowRoot).toBeNull(); // modo "closed" não expõe o shadowRoot
    expect(host.querySelector("h2")).toBeNull();
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

describe("montarPainel: lugar e cabeçalho (pedido de 11/11/2026)", () => {
  const html = '<div id="inventory_logos"><img id="inventory_applogo"></div><div class="inventory_page_right"></div><div id="inventories"></div>';
  it("entra ao lado do logo do jogo, dentro de #inventory_logos", () => {
    document.body.innerHTML = html;
    montarPainel(document, ctx(true), vi.fn());
    expect(document.querySelector("#inventory_logos #sv-painel")).not.toBeNull();
  });
  it("sem a área do logo, fica antes da grade como antes", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    montarPainel(document, ctx(true), vi.fn());
    expect(document.querySelector("#sv-painel")?.nextElementSibling?.id).toBe("inventories");
  });
  it("primeira linha é o logo da extensão, sem o texto de build", () => {
    document.body.innerHTML = html;
    const p = montarPainel(document, ctx(true), vi.fn())!;
    const primeira = p.raiz.firstElementChild as HTMLElement;
    expect(primeira.className).toBe("sv-logo");
    expect(primeira.querySelector("img")).not.toBeNull();
    expect(p.raiz.textContent).not.toMatch(/build/);
  });
});

describe("posicionar (alinha à esquerda da caixa de detalhes do item)", () => {
  const ret = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) });
  it("põe o painel na mesma coluna da caixa da direita", () => {
    document.body.innerHTML = '<div id="inventory_logos"></div><div class="inventory_page_right"></div>';
    const logos = document.querySelector("#inventory_logos") as HTMLElement;
    const direita = document.querySelector(".inventory_page_right") as HTMLElement;
    const host = document.createElement("section");
    logos.append(host);
    logos.getBoundingClientRect = () => ret(100, 1000) as DOMRect;
    direita.getBoundingClientRect = () => ret(740, 440) as DOMRect;
    posicionar(host, document);
    expect(logos.style.position).toBe("relative");
    expect(host.style.position).toBe("absolute");
    expect(host.style.left).toBe("640px");
    expect(host.style.width).toBe("440px");
  });
  it("sem caixa da direita visível (tela estreita), volta ao fluxo normal", () => {
    document.body.innerHTML = '<div id="inventory_logos"></div><div class="inventory_page_right"></div>';
    const host = document.createElement("section");
    document.querySelector("#inventory_logos")!.append(host);
    posicionar(host, document);
    expect(host.style.position).toBe("");
  });
});
