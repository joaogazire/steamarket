import { afterEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "../core/i18n.ts";
import { lerOrdem, renderControles } from "./controles.ts";

const montar = (extra = {}) => {
  const el = document.createElement("div");
  const aoMudar = vi.fn();
  document.body.append(el);
  const ctl = renderControles(el, { aoMudar, ...extra });
  const botao = (classe: string) => el.querySelector(classe) as HTMLButtonElement;
  return { el, aoMudar, ctl, botao };
};

describe("renderControles", () => {
  it("ocultar listados é um ícone (pedido 13/11), começa ligado, sem chave de texto", () => {
    const { el, botao } = montar();
    expect(el.querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    const b = botao(".sv-ocultar-listados-btn");
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.getAttribute("aria-label")).toBe("Ocultar listados");
    expect(b.querySelector("svg")).not.toBeNull();
  });
  it("clicar no ícone de ocultar listados avisa o novo estado", () => {
    const { botao, aoMudar } = montar();
    botao(".sv-ocultar-listados-btn").click();
    expect(aoMudar).toHaveBeenLastCalledWith({ ocultarListados: false, ocultarNaoVendaveis: false, ordem: "steam", agrupar: false });
    expect(botao(".sv-ocultar-listados-btn").getAttribute("aria-pressed")).toBe("false");
  });
  it("filtro de Not Marketable: começa mostrando; o ícone liga e desliga; abre como salvo", () => {
    const { botao, aoMudar } = montar();
    const b = botao(".sv-nao-vendaveis-btn");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(b.getAttribute("aria-label")).toBe("Ocultar itens que não vão ao mercado (Not Marketable)");
    b.click();
    expect(aoMudar).toHaveBeenLastCalledWith(expect.objectContaining({ ocultarNaoVendaveis: true }));
    expect(b.getAttribute("aria-pressed")).toBe("true");
    const el = document.createElement("div");
    document.body.append(el);
    renderControles(el, { aoMudar: vi.fn() }, { ocultarNaoVendaveis: true });
    expect(el.querySelector(".sv-nao-vendaveis-btn")!.getAttribute("aria-pressed")).toBe("true");
  });
  it("mostra o progresso dos preços", () => {
    const { el, ctl } = montar();
    ctl.progresso(3, 12);
    expect(el.textContent).toContain("preços 3/12");
    ctl.progresso(12, 12);
    expect(el.textContent).toContain("preços 12/12");
  });
  it("textos entram como texto", () => {
    const { el, ctl } = montar();
    ctl.status("<img src=x onerror=alert(1)>");
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("renderControles: botão R$ com setinha (ordenar por preço)", () => {
  const botao = (el: HTMLElement) => el.querySelector(".sv-ordem-btn") as HTMLButtonElement;
  it("mostra R$ e uma seta; cada clique troca: padrão → maior → menor → padrão", () => {
    const { el, aoMudar } = montar();
    expect(botao(el).textContent).toContain("R$");
    expect(botao(el).querySelector("svg")).not.toBeNull();
    expect(botao(el).dataset.ordem).toBe("steam");
    expect(botao(el).getAttribute("aria-label")).toBe("Ordenar por preço: desligado (ordem da Steam)");
    botao(el).click();
    expect(botao(el).dataset.ordem).toBe("maior");
    expect(botao(el).getAttribute("aria-label")).toBe("Ordenar por preço: maior preço primeiro");
    expect(aoMudar).toHaveBeenLastCalledWith(expect.objectContaining({ ordem: "maior" }));
    botao(el).click();
    expect(botao(el).dataset.ordem).toBe("menor");
    expect(aoMudar).toHaveBeenLastCalledWith(expect.objectContaining({ ordem: "menor" }));
    botao(el).click();
    expect(botao(el).dataset.ordem).toBe("steam");
    expect(aoMudar).toHaveBeenLastCalledWith(expect.objectContaining({ ordem: "steam" }));
  });
  it("abre com a ordem salva", () => {
    const el = document.createElement("div");
    document.body.append(el);
    renderControles(el, { aoMudar: vi.fn() }, { ordem: "menor" });
    expect(botao(el).dataset.ordem).toBe("menor");
    expect(botao(el).getAttribute("aria-pressed")).toBe("true");
  });
  it("lerOrdem só aceita valores conhecidos", () => {
    expect(lerOrdem("maior")).toBe("maior");
    expect(lerOrdem("menor")).toBe("menor");
    expect(lerOrdem("qualquer")).toBe("steam");
    expect(lerOrdem(undefined)).toBe("steam");
  });
});

describe("renderControles: ícone de agrupar itens iguais", () => {
  const botao = (el: HTMLElement) => el.querySelector(".sv-agrupar-btn") as HTMLButtonElement;
  it("é um botão de ícone com rótulo acessível; liga e desliga", () => {
    const { el, aoMudar } = montar();
    expect(botao(el).querySelector("svg")).not.toBeNull();
    expect(botao(el).getAttribute("aria-label")).toBe("Agrupar itens iguais");
    expect(botao(el).getAttribute("aria-pressed")).toBe("false");
    botao(el).click();
    expect(botao(el).getAttribute("aria-pressed")).toBe("true");
    expect(aoMudar).toHaveBeenLastCalledWith({ ocultarListados: true, ocultarNaoVendaveis: false, ordem: "steam", agrupar: true });
  });
  it("abre como salvo", () => {
    const el = document.createElement("div");
    document.body.append(el);
    renderControles(el, { aoMudar: vi.fn() }, { agrupar: true });
    expect(botao(el).getAttribute("aria-pressed")).toBe("true");
  });
  it("disposição 4: os filtros antes dos ícones na linha de cima; status, total e barra de seleção no resumo", () => {
    const el = document.createElement("div");
    const resumo = document.createElement("div");
    document.body.append(el, resumo);
    renderControles(el, { aoMudar: vi.fn() }, {}, { resumo });
    // filtros (ocultar listados e Not Marketable) e, ao lado, agrupar e ordenar
    expect([...el.children].map((c) => c.className)).toEqual(["sv-filtros", "sv-ferramentas"]);
    expect([...el.querySelector(".sv-filtros")!.children].map((c) => c.classList[1])).toEqual(["sv-ocultar-listados-btn", "sv-nao-vendaveis-btn"]);
    const linha = el.querySelector(".sv-ferramentas") as HTMLElement;
    expect(linha.querySelector(".sv-agrupar-btn")).not.toBeNull();
    expect(linha.querySelector(".sv-ordem-btn")).not.toBeNull();
    expect([...resumo.children].map((c) => c.className)).toEqual(["sv-status", "sv-total", "sv-sel"]);
    // o "Listar N" fica dentro da barra de seleção, no fim
    expect(resumo.querySelector(".sv-sel")!.lastElementChild!.classList.contains("sv-listar-sel")).toBe(true);
    expect(el.querySelector(".sv-total, .sv-status, .sv-listar-sel")).toBeNull();
  });
});

describe("renderControles: total numa linha e barra de seleção", () => {
  it("total começa escondido e mostra numa linha: valor, quanto recebe e quantos itens têm preço", () => {
    const { el, ctl } = montar();
    const total = () => el.querySelector(".sv-total") as HTMLElement;
    expect(total().hidden).toBe(true);
    ctl.total({ bruto: 123456, liquido: 107350, comPreco: 430, itens: 435 });
    expect(total().hidden).toBe(false);
    expect(total().textContent).toBe("Total R$ 1.234,56 (recebe R$ 1.073,50) · 430 de 435 itens");
    expect(total().querySelector("strong")!.textContent).toBe("R$ 1.234,56");
  });
  it("total sem itens some de novo; com todos com preço mostra só a quantidade", () => {
    const { el, ctl } = montar();
    ctl.total({ bruto: 100, liquido: 87, comPreco: 3, itens: 3 });
    expect(el.querySelector(".sv-total")!.textContent).toBe("Total R$ 1,00 (recebe R$ 0,87) · 3 itens");
    ctl.total(null);
    expect((el.querySelector(".sv-total") as HTMLElement).hidden).toBe(true);
  });
  it("barra de seleção: escondida sem seleção; com seleção mostra quantos, valor, quanto recebe e o Listar", () => {
    const { el, ctl } = montar();
    const sel = () => el.querySelector(".sv-sel") as HTMLElement;
    expect(sel().hidden).toBe(true);
    ctl.totalSelecionados({ bruto: 12000, liquido: 10400, comPreco: 64, itens: 64 });
    ctl.selecao(64);
    expect(sel().hidden).toBe(false);
    expect(sel().querySelector(".sv-sel-texto")!.textContent).toBe("64 itens · R$ 120,00 (recebe R$ 104,00)");
    expect(sel().querySelector(".sv-listar-sel")!.textContent).toBe("Listar 64");
    ctl.totalSelecionados({ bruto: 0, liquido: 0, comPreco: 0, itens: 0 });
    ctl.selecao(0);
    expect(sel().hidden).toBe(true);
  });
  it("durante a venda em lote a barra fica à vista (com Parar), mesmo quando a seleção zera", () => {
    const { el, ctl } = montar();
    ctl.totalSelecionados({ bruto: 0, liquido: 0, comPreco: 0, itens: 0 });
    ctl.selecao(0, { feitos: 2, total: 3 });
    expect((el.querySelector(".sv-sel") as HTMLElement).hidden).toBe(false);
    expect(el.querySelector(".sv-listar-sel")!.textContent).toBe("Parar 2/3");
  });
});

describe("renderControles: botão Listar selecionados", () => {
  const botao = (el: HTMLElement) => el.querySelector(".sv-listar-sel") as HTMLButtonElement;
  it("fica escondido sem seleção e mostra a quantidade quando há", () => {
    const { el, ctl } = montar();
    expect(botao(el).hidden).toBe(true);
    ctl.selecao(3);
    expect(botao(el).hidden).toBe(false);
    expect(botao(el).textContent).toBe("Listar 3");
    expect(botao(el).getAttribute("aria-label")).toBe("Listar os 3 itens selecionados");
  });
  it("clique pede para listar; durante a venda vira Parar com o progresso", () => {
    const aoListarSelecionados = vi.fn();
    const { el, ctl } = montar({ aoListarSelecionados });
    ctl.selecao(3);
    botao(el).click();
    expect(aoListarSelecionados).toHaveBeenCalledTimes(1);
    ctl.selecao(3, { feitos: 1, total: 3 });
    expect(botao(el).textContent).toBe("Parar 1/3");
    expect(botao(el).classList.contains("sv-rodando")).toBe(true);
  });
});


describe("renderControles em outro idioma", () => {
  afterEach(() => definirIdioma("pt"));
  it("em inglês: rótulos dos ícones, total e barra de seleção", () => {
    definirIdioma("en");
    const { el, ctl, botao } = montar();
    expect(botao(".sv-ocultar-listados-btn").getAttribute("aria-label")).toBe("Hide listed items");
    expect(botao(".sv-agrupar-btn").getAttribute("aria-label")).toBe("Group identical items");
    expect(botao(".sv-ordem-btn").getAttribute("aria-label")).toBe("Sort by price: off (Steam order)");
    ctl.total({ bruto: 100, liquido: 87, comPreco: 3, itens: 3 });
    expect(el.querySelector(".sv-total")!.textContent).toBe("Total R$ 1,00 (you get R$ 0,87) · 3 items");
    ctl.totalSelecionados({ bruto: 100, liquido: 87, comPreco: 2, itens: 2 });
    ctl.selecao(2);
    expect(el.querySelector(".sv-sel-texto")!.textContent).toBe("2 items · R$ 1,00 (you get R$ 0,87)");
    expect(el.querySelector(".sv-listar-sel")!.textContent).toBe("List 2");
  });
  it("em espanhol: a seleção vira Vender N", () => {
    definirIdioma("es");
    const { el, ctl } = montar();
    ctl.selecao(3);
    expect(el.querySelector(".sv-listar-sel")!.textContent).toBe("Vender 3");
  });
});
