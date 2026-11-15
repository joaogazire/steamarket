import { describe, expect, it } from "vitest";
import { criarAnel } from "./anel.ts";

describe("anel de progresso (o mesmo do inventário, para o mercado)", () => {
  it("mostra arco e porcentagem pelo feitos/total, com a contagem na dica", () => {
    const a = criarAnel(document);
    a.definir(3, 84);
    expect(a.el.classList.contains("sv-anel")).toBe(true);
    expect(a.el.hidden).toBe(false);
    expect(a.el.querySelector(".sv-anel-arco")!.getAttribute("stroke-dasharray")).toBe("3 100");
    expect(a.el.textContent).toBe("3%");
    expect(a.el.title).toBe("3 de 84 itens");
    expect(a.el.getAttribute("role")).toBe("progressbar");
    expect(a.el.getAttribute("aria-valuenow")).toBe("3");
  });
  it("some ao chegar a 100% e com total zero", () => {
    const a = criarAnel(document);
    a.definir(84, 84);
    expect(a.el.hidden).toBe(true);
    a.definir(0, 0);
    expect(a.el.hidden).toBe(true);
  });
});
