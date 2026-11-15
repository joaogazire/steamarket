import { afterEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "../core/i18n.ts";
import { montarMenuAjustes, renderSeletorIdioma } from "./ajustes.ts";

afterEach(() => definirIdioma("pt"));

const radios = (el: ParentNode) => [...el.querySelectorAll<HTMLButtonElement>("[role=radio]")];

describe("renderSeletorIdioma", () => {
  it("três opções com o nome na própria língua; marca a atual", () => {
    const el = document.createElement("div");
    renderSeletorIdioma(el, "pt", vi.fn());
    expect(el.querySelector("[role=radiogroup]")).not.toBeNull();
    expect(radios(el).map((r) => r.textContent)).toEqual(["Português", "English", "Español"]);
    expect(radios(el).map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
  });
  it("clicar escolhe e move a marca", () => {
    const el = document.createElement("div");
    const escolher = vi.fn();
    renderSeletorIdioma(el, "pt", escolher);
    radios(el)[1]!.click();
    expect(escolher).toHaveBeenCalledWith("en");
    expect(radios(el).map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });
  it("setas do teclado andam entre as opções (padrão de radiogroup)", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const escolher = vi.fn();
    renderSeletorIdioma(el, "pt", escolher);
    radios(el)[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(escolher).toHaveBeenLastCalledWith("en");
    radios(el)[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(escolher).toHaveBeenLastCalledWith("pt");
  });
});

describe("montarMenuAjustes (clique no logo)", () => {
  const montar = () => {
    const raiz = document.createElement("div");
    const botao = document.createElement("button");
    raiz.append(botao);
    document.body.append(raiz);
    const aoEscolher = vi.fn();
    const aoEscolherPerfil = vi.fn();
    const menu = montarMenuAjustes(botao, raiz, { atual: () => "pt", aoEscolher, perfil: () => "paciente", aoEscolherPerfil });
    const el = () => raiz.querySelector(".sv-menu") as HTMLElement;
    return { raiz, botao, aoEscolher, aoEscolherPerfil, menu, el };
  };
  it("começa fechado; o logo abre e marca aria-expanded", () => {
    const { botao, el } = montar();
    expect(el().hidden).toBe(true);
    expect(botao.getAttribute("aria-haspopup")).toBe("dialog");
    botao.click();
    expect(el().hidden).toBe(false);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(el().textContent).toContain("Idioma");
  });
  it("cada clique no logo dá uma volta completa (reinicia o giro e limpa no fim)", () => {
    const { botao } = montar();
    botao.click();
    expect(botao.classList.contains("sv-girando")).toBe(true);
    botao.dispatchEvent(new Event("animationend"));
    expect(botao.classList.contains("sv-girando")).toBe(false);
    botao.click(); // fechar também gira
    expect(botao.classList.contains("sv-girando")).toBe(true);
  });
  it("escolher idioma avisa e o menu continua aberto, já no idioma novo", () => {
    const { botao, el, aoEscolher } = montar();
    botao.click();
    radios(el())[2]!.click();
    expect(aoEscolher).toHaveBeenCalledWith("es");
    expect(el().hidden).toBe(false);
  });
  it("perfil de venda: três opções, o padrão (paciente) marcado; escolher avisa e marca", () => {
    const { botao, el, aoEscolherPerfil } = montar();
    botao.click();
    expect(el().textContent).toContain("Perfil de venda");
    const perfis = () => [...el().querySelectorAll<HTMLButtonElement>(".sv-perfis [role=radio]")];
    expect(perfis().map((b) => b.textContent)).toEqual(["Rápido", "Paciente", "Máximo"]);
    expect(perfis().map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    perfis()[0]!.click();
    expect(aoEscolherPerfil).toHaveBeenCalledWith("rapido");
    expect(perfis().map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(el().hidden).toBe(false);
  });
  it("trava de preço: interruptor no menu, desligado por padrão (trava ativa); clicar avisa e marca", () => {
    const raiz = document.createElement("div");
    const botao = document.createElement("button");
    raiz.append(botao);
    document.body.append(raiz);
    const aoAlternarTrava = vi.fn();
    montarMenuAjustes(botao, raiz, { atual: () => "pt", aoEscolher: vi.fn(), perfil: () => "paciente", aoEscolherPerfil: vi.fn(), semTrava: () => false, aoAlternarTrava });
    botao.click();
    const sw = raiz.querySelector<HTMLButtonElement>(".sv-trava[role=switch]")!;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(raiz.querySelector(".sv-menu")!.textContent).toContain("trava de preço");
    sw.click();
    expect(aoAlternarTrava).toHaveBeenCalledWith(true);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    sw.click();
    expect(aoAlternarTrava).toHaveBeenLastCalledWith(false);
    expect((raiz.querySelector(".sv-menu") as HTMLElement).hidden).toBe(false);
  });
  it("sem as opções de perfil, o menu só tem o idioma", () => {
    const raiz = document.createElement("div");
    const botao = document.createElement("button");
    raiz.append(botao);
    document.body.append(raiz);
    montarMenuAjustes(botao, raiz, { atual: () => "pt", aoEscolher: vi.fn() });
    botao.click();
    expect(raiz.querySelector(".sv-perfis")).toBeNull();
  });
  it("Esc fecha e devolve o foco ao logo; clicar de novo no logo também fecha", () => {
    const { botao, el, menu } = montar();
    botao.click();
    el().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el().hidden).toBe(true);
    expect(document.activeElement).toBe(botao);
    botao.click();
    botao.click();
    expect(el().hidden).toBe(true);
    botao.click();
    menu.fechar();
    expect(el().hidden).toBe(true);
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });
});
