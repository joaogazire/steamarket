import { afterEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "../core/i18n.ts";
import { montarPaginaAjustes } from "./pagina.ts";

afterEach(() => definirIdioma("pt"));

describe("página de configurações (ícone da extensão / about:addons)", () => {
  it("abre no idioma salvo, com o título e o seletor", async () => {
    document.body.innerHTML = "";
    await montarPaginaAjustes(document.body, { ler: async () => "en", salvar: vi.fn(async () => undefined), navegador: "pt-BR" });
    expect(document.querySelector("h1")!.textContent).toBe("steamarket settings");
    expect(document.documentElement.lang).toBe("en");
    expect(document.querySelector("[aria-checked=true]")!.textContent).toBe("English");
  });
  it("escolher salva, troca os textos na hora e mostra Salvo", async () => {
    document.body.innerHTML = "";
    const salvar = vi.fn(async () => undefined);
    await montarPaginaAjustes(document.body, { ler: async () => undefined, salvar, navegador: "pt-BR" });
    expect(document.querySelector("h1")!.textContent).toBe("Configurações do steamarket");
    (document.querySelector('[data-idioma="es"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(salvar).toHaveBeenCalledWith("es");
    expect(document.querySelector("h1")!.textContent).toBe("Ajustes de steamarket");
    expect(document.querySelector(".sv-salvo")!.textContent).toBe("Guardado");
  });
  it("se salvar falhar, não mostra Salvo nem deixa erro solto", async () => {
    document.body.innerHTML = "";
    const salvar = vi.fn(async () => {
      throw new Error("storage desligado");
    });
    await montarPaginaAjustes(document.body, { ler: async () => undefined, salvar, navegador: "pt-BR" });
    (document.querySelector('[data-idioma="en"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector(".sv-salvo")!.classList.contains("sv-visivel")).toBe(false);
  });
});
