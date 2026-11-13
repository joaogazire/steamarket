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
    const menu = montarMenuAjustes(botao, raiz, { atual: () => "pt", aoEscolher });
    const el = () => raiz.querySelector(".sv-menu") as HTMLElement;
    return { raiz, botao, aoEscolher, menu, el };
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
  it("escolher idioma avisa e o menu continua aberto, já no idioma novo", () => {
    const { botao, el, aoEscolher } = montar();
    botao.click();
    radios(el())[2]!.click();
    expect(aoEscolher).toHaveBeenCalledWith("es");
    expect(el().hidden).toBe(false);
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
