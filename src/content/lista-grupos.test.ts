import { describe, expect, it, vi } from "vitest";
import { renderLista } from "./lista-grupos.ts";
import type { Grupo } from "../core/tipos.ts";

const g = (nome: string, n: number): Grupo => ({
  nome, appid: 730, contagem: n,
  ativos: Array.from({ length: n }, (_, i) => ({ assetid: String(i), appid: 730, contextid: "2", market_hash_name: nome, marketable: true })),
});

describe("renderLista INV-01 / INV-04", () => {
  it("mostra cada grupo com o contador", () => {
    const el = document.createElement("div");
    renderLista(el, { tipo: "ok", grupos: [g("Caixa X", 37), g("Faca Y", 1)] }, { aoExpandir: vi.fn(), aoTentar: vi.fn() });
    const linhas = [...el.querySelectorAll(".sv-grupo")].map(
      (l) => `${l.querySelector(".sv-nome")?.textContent} ${l.querySelector(".sv-contagem")?.textContent}`,
    );
    expect(linhas).toEqual(["Caixa X ×37", "Faca Y ×1"]);
  });
  it("lista vazia mostra 'nenhum item vendável'", () => {
    const el = document.createElement("div");
    renderLista(el, { tipo: "ok", grupos: [] }, { aoExpandir: vi.fn(), aoTentar: vi.fn() });
    expect(el.textContent).toContain("nenhum item vendável");
  });
  it("erro mostra a mensagem e o botão 'tentar de novo'", () => {
    const el = document.createElement("div");
    const aoTentar = vi.fn();
    renderLista(el, { tipo: "erro", mensagem: "falha de rede" }, { aoExpandir: vi.fn(), aoTentar });
    expect(el.textContent).toContain("falha de rede");
    const b = [...el.querySelectorAll("button")].find((x) => x.textContent === "tentar de novo")!;
    b.click();
    expect(aoTentar).toHaveBeenCalledTimes(1);
  });
  it("clicar no grupo chama aoExpandir com o grupo", () => {
    const el = document.createElement("div");
    const aoExpandir = vi.fn();
    const grupos = [g("Caixa X", 2)];
    renderLista(el, { tipo: "ok", grupos }, { aoExpandir, aoTentar: vi.fn() });
    (el.querySelector(".sv-grupo") as HTMLElement).click();
    expect(aoExpandir).toHaveBeenCalledWith(grupos[0]);
  });
  it("nome do item entra como texto, nunca como HTML", () => {
    const el = document.createElement("div");
    renderLista(el, { tipo: "ok", grupos: [g('<img src=x onerror="alert(1)">', 1)] }, { aoExpandir: vi.fn(), aoTentar: vi.fn() });
    expect(el.querySelector("img")).toBeNull();
  });
});

describe("renderLista: preço sugerido e botão listar por linha", () => {
  const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  const montar = (extra: Record<string, unknown> = {}) => {
    const el = document.createElement("div");
    const aoVender = vi.fn();
    const aoExpandir = vi.fn();
    const ctl = renderLista(el, { tipo: "ok", grupos: [g("Caixa X", 3), g("Faca Y", 1)] }, { aoExpandir, aoTentar: vi.fn(), aoVender, formatar: fmt, permitirSintetico: true, ...extra });
    return { el, aoVender, aoExpandir, ctl };
  };
  const linha = (el: HTMLElement, i: number) => el.querySelectorAll(".sv-grupo")[i] as HTMLElement;

  it("cada linha começa com sugestão pendente e botão desabilitado", () => {
    const { el } = montar();
    expect(linha(el, 0).querySelector(".sv-sugestao")?.textContent).toBe("…");
    expect((linha(el, 0).querySelector(".sv-listar") as HTMLButtonElement).disabled).toBe(true);
  });
  it("definirSugestao mostra o preço e habilita o botão com o valor", () => {
    const { el, ctl } = montar();
    ctl.definirSugestao({ appid: 730, nome: "Caixa X" }, { preco: 32, base: "mediana de 50 vendas" });
    expect(linha(el, 0).querySelector(".sv-sugestao")?.textContent).toBe("R$ 0,32");
    const b = linha(el, 0).querySelector(".sv-listar") as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe("Listar 1 por R$ 0,32");
    expect(linha(el, 1).querySelector(".sv-sugestao")?.textContent).toBe("…");
  });
  it("sem preço sugerido o botão fica desabilitado e a linha explica", () => {
    const { el, ctl } = montar();
    ctl.definirSugestao({ appid: 730, nome: "Faca Y" }, { preco: null, base: "sem histórico" });
    expect(linha(el, 1).querySelector(".sv-sugestao")?.textContent).toBe("sem preço");
    expect((linha(el, 1).querySelector(".sv-listar") as HTMLButtonElement).disabled).toBe(true);
  });
  it("falha ao buscar mostra 'indisponível' e mantém o botão desabilitado", () => {
    const { el, ctl } = montar();
    ctl.definirSugestao({ appid: 730, nome: "Caixa X" }, "erro");
    expect(linha(el, 0).querySelector(".sv-sugestao")?.textContent).toBe("indisponível");
    expect((linha(el, 0).querySelector(".sv-listar") as HTMLButtonElement).disabled).toBe(true);
  });
  it("clique real no botão chama aoVender com o grupo e o preço, sem expandir a linha", () => {
    const { el, ctl, aoVender, aoExpandir } = montar();
    ctl.definirSugestao({ appid: 730, nome: "Caixa X" }, { preco: 32, base: "x" });
    (linha(el, 0).querySelector(".sv-listar") as HTMLButtonElement).click();
    expect(aoVender).toHaveBeenCalledTimes(1);
    expect(aoVender.mock.calls[0]![0].nome).toBe("Caixa X");
    expect(aoVender.mock.calls[0]![1]).toBe(32);
    expect(aoExpandir).not.toHaveBeenCalled();
  });
  it("por padrão, clique sintético (isTrusted=false) é ignorado", () => {
    const { el, ctl, aoVender } = montar({ permitirSintetico: undefined });
    ctl.definirSugestao({ appid: 730, nome: "Caixa X" }, { preco: 32, base: "x" });
    (linha(el, 0).querySelector(".sv-listar") as HTMLButtonElement).click();
    expect(aoVender).not.toHaveBeenCalled();
  });
  it("nome do item com HTML aparece como texto, também na sugestão", () => {
    const el = document.createElement("div");
    const ctl = renderLista(el, { tipo: "ok", grupos: [g("<img src=x onerror=alert(1)>", 1)] }, { aoExpandir: vi.fn(), aoTentar: vi.fn(), formatar: fmt });
    ctl.definirSugestao({ appid: 730, nome: "<img src=x onerror=alert(1)>" }, { preco: 5, base: "x" });
    expect(el.querySelector("img")).toBeNull();
  });

  it("mesmo nome em apps diferentes (Steam 753) não se confunde", () => {
    const el = document.createElement("div");
    const a = { ...g("Gema", 1), appid: 753 };
    const b = { ...g("Gema", 2), appid: 730 };
    const ctl = renderLista(el, { tipo: "ok", grupos: [a, b] }, { aoExpandir: vi.fn(), aoTentar: vi.fn(), formatar: fmt });
    ctl.definirSugestao({ appid: 730, nome: "Gema" }, { preco: 50, base: "x" });
    const sug = [...el.querySelectorAll(".sv-sugestao")].map((x) => x.textContent);
    expect(sug).toEqual(["…", "R$ 0,50"]);
  });

  it("depois do clique o botão desabilita (evita Espaço/Enter repetir a venda) e volta ao atualizar a contagem", () => {
    const { el, ctl, aoVender } = montar();
    const grupo = { appid: 730, nome: "Caixa X" };
    ctl.definirSugestao(grupo, { preco: 32, base: "x" });
    const b = linha(el, 0).querySelector(".sv-listar") as HTMLButtonElement;
    b.click();
    expect(b.disabled).toBe(true);
    b.click();
    expect(aoVender).toHaveBeenCalledTimes(1);
    ctl.atualizarContagem(grupo);
    expect(b.disabled).toBe(false);
  });
});
