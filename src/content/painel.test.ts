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
    const primeira = p.raiz.querySelector(".sv-topo > :last-child") as HTMLElement;
    expect(primeira.className).toBe("sv-logo");
    expect(primeira.querySelector("img")).not.toBeNull();
    expect(p.raiz.textContent).not.toMatch(/build/);
    // só o ícone, sem o nome escrito (pedido 13/11); o nome fica no alt e na dica
    expect(primeira.textContent).toBe("");
    expect(primeira.querySelector("img")!.alt).toBe("steamarket");
  });
});

describe("posicionar (encostado à direita, na borda da caixa de detalhes do item)", () => {
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
    // logos vai de 100 a 1100; a caixa da direita termina em 1180 → 80 px para fora da área do logo
    expect(host.style.right).toBe("-80px");
    expect(host.style.left).toBe("");
    expect(host.style.maxWidth).toBe("440px");
  });
  it("nunca estica a área do logo do jogo (pedido 13/11: a barra mantém a altura da Steam)", () => {
    document.body.innerHTML = '<div id="inventory_logos"></div><div class="inventory_page_right"></div>';
    const logos = document.querySelector("#inventory_logos") as HTMLElement;
    const direita = document.querySelector(".inventory_page_right") as HTMLElement;
    const host = document.createElement("section");
    logos.append(host);
    logos.style.minHeight = "300px"; // sobra de uma versão antiga
    Object.defineProperty(host, "offsetHeight", { value: 220 });
    logos.getBoundingClientRect = () => ret(100, 1000) as DOMRect;
    direita.getBoundingClientRect = () => ret(740, 440) as DOMRect;
    posicionar(host, document);
    expect(logos.style.minHeight).toBe("");
  });
  it("com o logo do jogo, o painel se estende para a esquerda até perto dele (fica mais baixo)", () => {
    document.body.innerHTML = '<div id="inventory_logos"><img id="inventory_applogo"></div><div class="inventory_page_right"></div>';
    const logos = document.querySelector("#inventory_logos") as HTMLElement;
    const direita = document.querySelector(".inventory_page_right") as HTMLElement;
    const img = document.querySelector("#inventory_applogo") as HTMLElement;
    const host = document.createElement("section");
    logos.append(host);
    logos.getBoundingClientRect = () => ret(100, 1000) as DOMRect;
    direita.getBoundingClientRect = () => ret(740, 440) as DOMRect;
    img.getBoundingClientRect = () => ret(110, 400) as DOMRect;
    posicionar(host, document);
    // do fim do logo (510) + 24 de folga até a borda direita da caixa (1180)
    expect(host.style.maxWidth).toBe("646px");
  });
  it("centraliza a linha de ícones e o total na altura da área do logo (posição mais natural)", () => {
    document.body.innerHTML = '<div id="inventory_logos"></div><div class="inventory_page_right"></div>';
    const logos = document.querySelector("#inventory_logos") as HTMLElement;
    const direita = document.querySelector(".inventory_page_right") as HTMLElement;
    const host = document.createElement("section");
    logos.append(host);
    logos.getBoundingClientRect = () => ({ ...ret(100, 1000), height: 118 }) as DOMRect;
    direita.getBoundingClientRect = () => ret(740, 440) as DOMRect;
    posicionar(host, document);
    // (118 - 58) / 2 = 30: a barra de seleção, quando aparece, cresce para baixo sem mexer no resto
    expect(host.style.top).toBe("30px");
  });
  it("área do logo baixa: encosta a 8 px do topo", () => {
    document.body.innerHTML = '<div id="inventory_logos"></div><div class="inventory_page_right"></div>';
    const logos = document.querySelector("#inventory_logos") as HTMLElement;
    const direita = document.querySelector(".inventory_page_right") as HTMLElement;
    const host = document.createElement("section");
    logos.append(host);
    logos.getBoundingClientRect = () => ({ ...ret(100, 1000), height: 60 }) as DOMRect;
    direita.getBoundingClientRect = () => ret(740, 440) as DOMRect;
    posicionar(host, document);
    expect(host.style.top).toBe("8px");
  });
  it("logo do jogo largo: o painel fica só no espaço livre, sem passar por cima do logo", () => {
    document.body.innerHTML = '<div id="inventory_logos"><img id="inventory_applogo"></div><div class="inventory_page_right"></div>';
    const logos = document.querySelector("#inventory_logos") as HTMLElement;
    const direita = document.querySelector(".inventory_page_right") as HTMLElement;
    const img = document.querySelector("#inventory_applogo") as HTMLElement;
    const host = document.createElement("section");
    logos.append(host);
    logos.getBoundingClientRect = () => ret(100, 1000) as DOMRect;
    direita.getBoundingClientRect = () => ret(740, 440) as DOMRect;
    img.getBoundingClientRect = () => ret(110, 700) as DOMRect;
    posicionar(host, document);
    // logo termina em 810; 1180 - 810 - 24 = 346 (menor que a coluna de 440)
    expect(host.style.maxWidth).toBe("346px");
  });
  it("sem caixa da direita visível (tela estreita), volta ao fluxo normal", () => {
    document.body.innerHTML = '<div id="inventory_logos"></div><div class="inventory_page_right"></div>';
    const host = document.createElement("section");
    document.querySelector("#inventory_logos")!.append(host);
    posicionar(host, document);
    expect(host.style.position).toBe("");
  });
});

describe("avisar: sucesso tem estilo próprio (pedido 13/11)", () => {
  it("aviso de sucesso ganha a classe sv-ok; aviso comum não", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    const p = montarPainel(document, ctx(true), vi.fn())!;
    const el = () => p.raiz.querySelector(".sv-aviso") as HTMLElement;
    p.avisar("Listado · aprove no celular", "ok");
    expect(el().hidden).toBe(false);
    expect(el().classList.contains("sv-ok")).toBe(true);
    p.avisar("erro qualquer");
    expect(el().classList.contains("sv-ok")).toBe(false);
    p.avisar(null);
    expect(el().hidden).toBe(true);
  });
});

describe("montarPainel: disposição 4 (tudo à direita, empilhado)", () => {
  it("linha de cima com os controles e o logo no fim; embaixo o resumo", () => {
    document.body.innerHTML = '<div id="inventories"></div>';
    const p = montarPainel(document, ctx(true), vi.fn())!;
    const cabeca = p.raiz.firstElementChild as HTMLElement;
    expect(cabeca.className).toBe("sv-cabeca");
    expect([...cabeca.children].map((c) => c.className)).toEqual(["sv-topo", "sv-resumo"]);
    const topo = cabeca.firstElementChild as HTMLElement;
    expect(topo.firstElementChild).toBe(p.conteudo);
    expect(topo.lastElementChild!.className).toBe("sv-logo");
    expect(p.resumo.className).toBe("sv-resumo");
  });
});
