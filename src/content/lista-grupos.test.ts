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
    const linhas = [...el.querySelectorAll(".sv-grupo")].map((l) => l.textContent?.replace(/\s+/g, " ").trim());
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
