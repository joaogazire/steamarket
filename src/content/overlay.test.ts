import { beforeEach, describe, expect, it } from "vitest";
import { aplicarPrecos, idDoQuadrado, idsVisiveis, marcarListados, ordenarListados } from "./overlay.ts";

function grade(...ids: string[]): void {
  document.body.innerHTML = `<div id="inventories">${ids.map((i) => `<div class="itemHolder"><div class="item" id="${i}"></div></div>`).join("")}</div>`;
}

describe("aplicarPrecos (preço em cima do quadrado do item)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("escreve o preço dentro do quadrado do ativo", () => {
    grade("730_2_111", "730_2_222");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,32"]]));
    expect(document.getElementById("730_2_111")?.querySelector(".sv-preco-item")?.textContent).toBe("R$ 0,32");
    expect(document.getElementById("730_2_222")?.querySelector(".sv-preco-item")).toBeNull();
  });
  it("chamar de novo atualiza o texto sem duplicar o elemento", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,32"]]));
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,40"]]));
    const marcas = document.getElementById("730_2_111")!.querySelectorAll(".sv-preco-item");
    expect(marcas).toHaveLength(1);
    expect(marcas[0]!.textContent).toBe("R$ 0,40");
  });
  it("ativo que não está na página (outra página da grade) é ignorado sem erro", () => {
    grade("730_2_111");
    expect(() => aplicarPrecos(document, new Map([["730_2_999", "R$ 1,00"]]))).not.toThrow();
  });
  it("o texto entra como texto, nunca como HTML", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "<img src=x onerror=alert(1)>"]]));
    expect(document.getElementById("730_2_111")!.querySelector("img")).toBeNull();
    expect(document.getElementById("730_2_111")?.querySelector(".sv-preco-item")?.textContent).toBe("<img src=x onerror=alert(1)>");
  });
  it("injeta o estilo uma única vez", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "a"]]));
    aplicarPrecos(document, new Map([["730_2_111", "b"]]));
    expect(document.head.querySelectorAll("style#sv-estilo-overlay")).toHaveLength(1);
  });
  it("o preço não captura cliques (a grade da Steam continua selecionável)", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,32"]]));
    const css = document.head.querySelector("style#sv-estilo-overlay")!.textContent!;
    expect(css).toContain("pointer-events: none");
  });
  it("reaplicar o mesmo preço não mexe no DOM (senão o observador da grade entra em ciclo)", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,32"]]));
    const obs = new MutationObserver(() => undefined);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,32"]]));
    expect(obs.takeRecords()).toHaveLength(0);
    obs.disconnect();
  });
});

describe("marcarListados / ocultar", () => {
  const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  beforeEach(() => {
    document.head.innerHTML = "";
  });
  it("mostra 'Listado R$ x' no quadrado do item já anunciado", () => {
    grade("730_2_111", "730_2_222");
    marcarListados(document, new Map([["730_2_111", 3500]]), fmt, false);
    const marca = document.getElementById("730_2_111")!.querySelector(".sv-preco-item.sv-listado");
    expect(marca?.textContent).toBe("Listado R$ 35,00");
    expect(document.getElementById("730_2_222")!.querySelector(".sv-listado")).toBeNull();
  });
  it("preço ilegível mostra só 'Listado'", () => {
    grade("730_2_111");
    marcarListados(document, new Map([["730_2_111", null]]), fmt, false);
    expect(document.getElementById("730_2_111")!.querySelector(".sv-listado")?.textContent).toBe("Listado");
  });
  it("ocultar=true esconde o quadrado inteiro; ocultar=false mostra de novo", () => {
    grade("730_2_111", "730_2_222");
    const m = new Map([["730_2_111", 100]]);
    marcarListados(document, m, fmt, true);
    expect(document.getElementById("730_2_111")!.closest(".itemHolder")!.classList.contains("sv-oculto")).toBe(true);
    expect(document.getElementById("730_2_222")!.closest(".itemHolder")!.classList.contains("sv-oculto")).toBe(false);
    marcarListados(document, m, fmt, false);
    expect(document.getElementById("730_2_111")!.closest(".itemHolder")!.classList.contains("sv-oculto")).toBe(false);
  });
  it("o estilo de ocultar usa display none", () => {
    grade("730_2_111");
    marcarListados(document, new Map([["730_2_111", 100]]), fmt, true);
    expect(document.head.querySelector("style#sv-estilo-overlay")!.textContent).toMatch(/\.sv-oculto[^}]*display:\s*none/);
  });
  it("preço sugerido não sobrescreve a marca de listado", () => {
    grade("730_2_111");
    marcarListados(document, new Map([["730_2_111", 100]]), fmt, false);
    aplicarPrecos(document, new Map([["730_2_111", "R$ 9,99"]]));
    expect(document.getElementById("730_2_111")!.querySelector(".sv-preco-item")?.textContent).toBe("Listado R$ 1,00");
  });
  it("marcar de novo sem mudança não mexe no DOM", () => {
    grade("730_2_111");
    const m = new Map([["730_2_111", 100]]);
    marcarListados(document, m, fmt, false);
    const obs = new MutationObserver(() => undefined);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    marcarListados(document, m, fmt, false);
    expect(obs.takeRecords()).toHaveLength(0);
    obs.disconnect();
  });
});

describe("idDoQuadrado", () => {
  it("acha o id do quadrado a partir de um filho clicado", () => {
    grade("730_2_111");
    const filho = document.createElement("img");
    document.getElementById("730_2_111")!.append(filho);
    expect(idDoQuadrado(filho)).toBe("730_2_111");
  });
  it("fora de um quadrado, ou com id estranho, devolve null", () => {
    document.body.innerHTML = '<div class="item" id="x"><b id="y"></b></div><p id="z"></p>';
    expect(idDoQuadrado(document.getElementById("y"))).toBeNull();
    expect(idDoQuadrado(document.getElementById("z"))).toBeNull();
    expect(idDoQuadrado(null)).toBeNull();
  });
});

describe("idsVisiveis (quadrados da página da grade que está na tela)", () => {
  const pagina = (ids: string[], oculta = false) =>
    `<div class="inventory_page"${oculta ? ' style="display: none;"' : ""}>${ids.map((i) => `<div class="itemHolder"><div class="item" id="${i}"></div></div>`).join("")}</div>`;
  it("só devolve os quadrados da página visível, na ordem", () => {
    document.body.innerHTML = `<div id="inventories"><div class="inventory_ctn">${pagina(["730_2_1", "730_2_2"], true)}${pagina(["730_2_3", "730_16_4"])}</div></div>`;
    expect(idsVisiveis(document)).toEqual(["730_2_3", "730_16_4"]);
  });
  it("ignora o inventário de outro jogo escondido e ids fora do formato", () => {
    document.body.innerHTML = `<div id="inventories"><div class="inventory_ctn" style="display: none;">${pagina(["440_2_9"])}</div><div class="inventory_ctn">${pagina(["730_2_3", "lixo"])}</div></div>`;
    expect(idsVisiveis(document)).toEqual(["730_2_3"]);
  });
});

describe("ordenarListados (listados vão para as últimas páginas)", () => {
  function paginas(...paginas: string[][]): void {
    document.body.innerHTML = `<div id="inventories"><div class="inv">${paginas
      .map((ids) => `<div class="inventory_page">${ids.map((i) => `<div class="itemHolder"><div class="item" id="${i}"></div></div>`).join("")}</div>`)
      .join("")}</div></div>`;
  }
  const ordem = () => [...document.querySelectorAll(".inventory_page")].map((p) => [...p.querySelectorAll(".item")].map((e) => e.id));
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("move os listados para o fim mantendo o tamanho de cada página", () => {
    paginas(["730_2_1", "730_2_2"], ["730_2_3", "730_2_4"]);
    ordenarListados(document, (id) => id === "730_2_1" || id === "730_2_3", true);
    expect(ordem()).toEqual([["730_2_2", "730_2_4"], ["730_2_1", "730_2_3"]]);
  });
  it("desligar restaura a ordem original", () => {
    paginas(["730_2_1", "730_2_2"], ["730_2_3", "730_2_4"]);
    const l = (id: string) => id === "730_2_1";
    ordenarListados(document, l, true);
    ordenarListados(document, l, false);
    expect(ordem()).toEqual([["730_2_1", "730_2_2"], ["730_2_3", "730_2_4"]]);
  });
  it("sem mudança de ordem não mexe no DOM", () => {
    paginas(["730_2_1", "730_2_2"]);
    ordenarListados(document, (id) => id === "730_2_2", true);
    const obs = new MutationObserver(() => undefined);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    ordenarListados(document, (id) => id === "730_2_2", true);
    expect(obs.takeRecords()).toHaveLength(0);
  });
});
