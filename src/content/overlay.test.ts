import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definirIdioma } from "../core/i18n.ts";
import { acaoDoBotao, aplicarPrecos, idDoQuadrado, idsVisiveis, marcarGrupos, marcarListados, ordenarGrade, ordenarListados, type AcaoQuadrado } from "./overlay.ts";

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

describe("botões de ação no quadrado (Listar)", () => {
  const botoes = (id: string) => [...(document.getElementById(id)?.querySelectorAll<HTMLButtonElement>(".sv-acao") ?? [])];
  const listar = (id: string): Map<string, AcaoQuadrado[]> =>
    new Map([[id, [{ acao: "listar", rotulo: "Listar", aria: "Listar no mercado por R$ 0,17" }]]]);
  it("aparecem só nos quadrados com ações, com rótulo acessível", () => {
    grade("730_2_111", "730_2_222");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,17"], ["730_2_222", "R$ 0,30"]]), listar("730_2_111"));
    const [b] = botoes("730_2_111");
    expect(b?.textContent).toBe("Listar");
    expect(b?.getAttribute("aria-label")).toBe("Listar no mercado por R$ 0,17");
    expect(b?.type).toBe("button");
    expect(b?.dataset.svAcao).toBe("listar");
    expect(botoes("730_2_222")).toHaveLength(0);
  });
  it("some quando a ação sai da lista e não duplica", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,17"]]), listar("730_2_111"));
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,17"]]), listar("730_2_111"));
    expect(document.querySelectorAll(".sv-acao")).toHaveLength(1);
    aplicarPrecos(document, new Map([["730_2_111", "listando…"]]), new Map());
    expect(botoes("730_2_111")).toHaveLength(0);
  });
  it("ação ocupada fica desabilitada", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,17"]]), new Map([["730_2_111", [{ acao: "listar", rotulo: "…", aria: "listando", ocupado: true }]]]));
    expect(botoes("730_2_111")[0]!.disabled).toBe(true);
  });
  it("quadrado listado não ganha botão", () => {
    grade("730_2_111");
    marcarListados(document, new Map([["730_2_111", 100]]), (c) => String(c), false);
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,17"]]), listar("730_2_111"));
    expect(botoes("730_2_111")).toHaveLength(0);
  });
  it("acaoDoBotao diz qual ação e qual quadrado; clique fora de botão dá null", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,17"]]), listar("730_2_111"));
    expect(acaoDoBotao(botoes("730_2_111")[0]!)).toEqual({ id: "730_2_111", acao: "listar" });
    expect(acaoDoBotao(document.getElementById("730_2_111"))).toBeNull();
    expect(acaoDoBotao(null)).toBeNull();
  });
});

describe("listados aguardando aprovação no celular (pedido 13/11)", () => {
  it("mostram 'Falta aprovar' em vez do preço anunciado", () => {
    grade("730_2_111", "730_2_222");
    marcarListados(document, new Map([["730_2_111", 18], ["730_2_222", 30]]), (c) => `R$ ${c}`, false, new Set(["730_2_111"]));
    const marca = (id: string) => document.getElementById(id)!.querySelector(".sv-preco-item")!;
    expect(marca("730_2_111").textContent).toBe("Falta aprovar");
    expect(marca("730_2_111").classList.contains("sv-pendente")).toBe(true);
    expect(marca("730_2_222").textContent).toBe("Listado R$ 30");
    expect(marca("730_2_222").classList.contains("sv-pendente")).toBe(false);
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
  it("devolve se mudou a ordem (para recarregar as imagens só quando precisa)", () => {
    document.body.innerHTML = `<div id="inventories"><div class="inventory_page"><div class="itemHolder"><div class="item" id="730_2_1"></div></div><div class="itemHolder"><div class="item" id="730_2_2"></div></div></div></div>`;
    expect(ordenarListados(document, (id) => id === "730_2_1", true)).toBe(true);
    expect(ordenarListados(document, (id) => id === "730_2_1", true)).toBe(false);
    expect(ordenarListados(document, (id) => id === "730_2_1", false)).toBe(true);
  });
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

describe("ordenarGrade (ordem por preço, listados no fim)", () => {
  const paginas = (...ps: string[][]) => {
    document.body.innerHTML = `<div id="inventories">${ps
      .map((ids) => `<div class="inventory_page">${ids.map((i) => (i ? `<div class="itemHolder"><div class="item" id="${i}"></div></div>` : '<div class="itemHolder disabled"></div>')).join("")}</div>`)
      .join("")}</div>`;
  };
  const ordem = () => [...document.querySelectorAll("#inventories .inventory_page")].map((p) => [...p.querySelectorAll(".item")].map((e) => e.id.split("_")[2]));
  it("ordena pela chave em todas as páginas, mantendo o tamanho de cada página e as casas vazias no fim", () => {
    paginas(["730_2_1", "730_2_2"], ["730_2_3", ""]);
    const preco: Record<string, number> = { "730_2_1": 10, "730_2_2": 30, "730_2_3": 20 };
    expect(ordenarGrade(document, (id) => [-(preco[id] ?? 0)])).toBe(true);
    expect(ordem()).toEqual([["2", "3"], ["1"]]);
  });
  it("empate fica na ordem original; chave vazia volta à ordem da Steam", () => {
    paginas(["730_2_1", "730_2_2", "730_2_3"]);
    ordenarGrade(document, (id) => [id === "730_2_3" ? 0 : 1]);
    expect(ordem()).toEqual([["3", "1", "2"]]);
    ordenarGrade(document, () => []);
    expect(ordem()).toEqual([["1", "2", "3"]]);
  });
});

describe("marcarGrupos (agrupar itens iguais)", () => {
  const holder = (id: string) => document.getElementById(id)!.closest(".itemHolder")!;
  it("mostra a quantidade no representante e esconde as cópias", () => {
    grade("730_2_1", "730_2_2", "730_2_3");
    marcarGrupos(document, new Map([["730_2_1", 3]]), new Set(["730_2_2", "730_2_3"]));
    expect(document.getElementById("730_2_1")!.querySelector(".sv-qtd")?.textContent).toBe("x3");
    expect(holder("730_2_2").classList.contains("sv-agrupado")).toBe(true);
    expect(holder("730_2_1").classList.contains("sv-agrupado")).toBe(false);
  });
  it("desligar tira as marcas e mostra tudo de novo", () => {
    grade("730_2_1", "730_2_2");
    marcarGrupos(document, new Map([["730_2_1", 2]]), new Set(["730_2_2"]));
    marcarGrupos(document, new Map(), new Set());
    expect(document.querySelector(".sv-qtd")).toBeNull();
    expect(document.querySelector(".sv-agrupado")).toBeNull();
  });
  it("quantidade 1 não ganha marca; repetir sem mudança não mexe no DOM", () => {
    grade("730_2_1", "730_2_2");
    marcarGrupos(document, new Map([["730_2_1", 1]]), new Set());
    expect(document.querySelector(".sv-qtd")).toBeNull();
    marcarGrupos(document, new Map([["730_2_1", 2]]), new Set(["730_2_2"]));
    const obs = new MutationObserver(() => undefined);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    marcarGrupos(document, new Map([["730_2_1", 2]]), new Set(["730_2_2"]));
    expect(obs.takeRecords()).toHaveLength(0);
    obs.disconnect();
  });
  it("idsVisiveis ignora as cópias escondidas", () => {
    document.body.innerHTML = '<div id="inventories"><div class="inventory_ctn"><div class="inventory_page"><div class="itemHolder"><div class="item" id="730_2_1"></div></div><div class="itemHolder"><div class="item" id="730_2_2"></div></div></div></div></div>';
    marcarGrupos(document, new Map([["730_2_1", 2]]), new Set(["730_2_2"]));
    expect(idsVisiveis(document)).toEqual(["730_2_1"]);
  });
});

describe("seleção e marcas estáticas (pedido 13/11)", () => {
  it("'Falta aprovar' não herda a pulsação do 'listando…'", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "listando…"]]));
    const marca = document.getElementById("730_2_111")!.querySelector(".sv-preco-item")!;
    expect(marca.classList.contains("sv-ocupado")).toBe(true);
    marcarListados(document, new Map([["730_2_111", 18]]), (c) => String(c), false, new Set(["730_2_111"]));
    expect(marca.textContent).toBe("Falta aprovar");
    expect(marca.classList.contains("sv-ocupado")).toBe(false);
  });
  it("botão de seleção mostra se está marcado (aria-pressed) e o clique é reconhecido", () => {
    grade("730_2_111");
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,18"]]), new Map([["730_2_111", [
      { acao: "selecionar", rotulo: "", aria: "Selecionar para listar", marcado: true },
      { acao: "listar", rotulo: "Listar", aria: "Listar" },
    ]]]));
    const sel = document.querySelector<HTMLButtonElement>(".sv-acao-selecionar")!;
    expect(sel.getAttribute("aria-pressed")).toBe("true");
    expect(acaoDoBotao(sel)).toEqual({ id: "730_2_111", acao: "selecionar" });
    aplicarPrecos(document, new Map([["730_2_111", "R$ 0,18"]]), new Map([["730_2_111", [
      { acao: "selecionar", rotulo: "", aria: "Selecionar para listar", marcado: false },
    ]]]));
    expect(sel.getAttribute("aria-pressed")).toBe("false");
  });
});


describe("marcarListados em outro idioma", () => {
  afterEach(() => definirIdioma("pt"));
  it("Falta aprovar e Listado seguem o idioma", () => {
    document.body.innerHTML = '<div id="inventories"><div class="itemHolder"><div class="item" id="730_2_1"></div></div><div class="itemHolder"><div class="item" id="730_2_2"></div></div></div>';
    definirIdioma("en");
    marcarListados(document, new Map([["730_2_1", 3500], ["730_2_2", 100]]), (c) => `R$ ${c / 100}`, false, new Set(["730_2_2"]));
    expect(document.getElementById("730_2_1")!.querySelector(".sv-listado")!.textContent).toBe("Listed R$ 35");
    expect(document.getElementById("730_2_2")!.querySelector(".sv-listado")!.textContent).toBe("Needs approval");
  });
});
