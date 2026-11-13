import { afterEach, describe, expect, it } from "vitest";
import { definirIdioma, IDIOMAS, idioma, lerIdioma, textosDe, tx } from "./i18n.ts";

afterEach(() => definirIdioma("pt"));

describe("lerIdioma", () => {
  it("o salvo vale primeiro; sem ele, a língua do navegador; sem nada, português", () => {
    expect(lerIdioma("es", "en-US")).toBe("es");
    expect(lerIdioma(undefined, "en-US")).toBe("en");
    expect(lerIdioma(undefined, "es-419")).toBe("es");
    expect(lerIdioma(undefined, "pt-BR")).toBe("pt");
    expect(lerIdioma(undefined, "de-DE")).toBe("pt");
    expect(lerIdioma("klingon", undefined)).toBe("pt");
  });
});

describe("textos", () => {
  it("os três idiomas têm exatamente as mesmas chaves", () => {
    const chaves = (i: "pt" | "en" | "es") => Object.keys(textosDe(i)).sort();
    expect(chaves("en")).toEqual(chaves("pt"));
    expect(chaves("es")).toEqual(chaves("pt"));
  });
  it("nenhum texto vazio, e os que recebem valores usam todos eles", () => {
    for (const { id } of IDIOMAS) {
      for (const [k, v] of Object.entries(textosDe(id))) {
        const s = typeof v === "function" ? (v as (...a: unknown[]) => string)("§1", "§2", "§3", "§4") : v;
        expect(s, `${id}.${k}`).not.toBe("");
        if (typeof v === "function") for (let i = 1; i <= v.length; i++) expect(s, `${id}.${k}`).toContain(`§${i}`);
      }
    }
  });
  it("troca o idioma de tudo de uma vez", () => {
    expect(tx().listar).toBe("Listar");
    definirIdioma("en");
    expect(idioma()).toBe("en");
    expect(tx().listar).toBe("List");
    expect(tx().itens(1)).toBe("1 item");
    expect(tx().itens(3)).toBe("3 items");
    definirIdioma("es");
    expect(tx().listar).toBe("Vender");
    expect(tx().itens(3)).toBe("3 artículos");
  });
  it("conferindo e listando terminam em … nos três idiomas (é o que faz o quadrado pulsar)", () => {
    for (const { id } of IDIOMAS) {
      expect(textosDe(id).conferindo.endsWith("…"), id).toBe(true);
      expect(textosDe(id).listando.endsWith("…"), id).toBe(true);
    }
  });
  it("os nomes no seletor ficam na própria língua", () => {
    expect(IDIOMAS.map((i) => i.nome)).toEqual(["Português", "English", "Español"]);
  });
});
