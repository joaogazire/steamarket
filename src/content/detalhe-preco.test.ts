import { describe, expect, it, vi } from "vitest";
import { renderDetalhe } from "./detalhe-preco.ts";
import { REGRA_PADRAO } from "../core/tipos.ts";
import type { DadosPreco } from "../background/roteador.ts";

const dados: DadosPreco = {
  visao: { menorAnuncio: 320, mediana: 300, volume: 10 },
  ordens: { maiorOrdemCompra: 250, menorAnuncio: 320 },
  historico: [{ t: 1, preco: 200, volume: 10 }, { t: 2, preco: 300, volume: 40 }],
};
const texto = (el: Element) => el.textContent?.replace(/\s+/g, " ") ?? "";
const abrir = (d: DadosPreco = dados, aoSelecionar = vi.fn()) => {
  const el = document.createElement("div");
  renderDetalhe(el, { dados: d, regra: REGRA_PADRAO, formatar: (c) => `R$ ${(c / 100).toFixed(2)}`, aoSelecionar });
  return { el, aoSelecionar };
};

describe("renderDetalhe PRC-01 / SUG / FEE-01", () => {
  it("mostra última venda, menor anúncio e maior ordem de compra", () => {
    const { el } = abrir();
    expect(texto(el)).toContain("Última venda R$ 3.00");
    expect(texto(el)).toContain("Menor anúncio R$ 3.20");
    expect(texto(el)).toContain("Maior ordem R$ 2.50");
  });
  it("mostra as 3 sugestões com o líquido de cada uma", () => {
    const { el } = abrir();
    const t = texto(el);
    expect(t).toContain("Rápido R$ 2.50"); // líquido de 250: 250 - 12 - 6... conferido abaixo
    expect(t).toContain("Equilibrado R$ 3.00");
    expect(t).toContain("Paciente R$ 3.20");
    expect(t).toContain("mediana de 50 vendas");
    expect(el.querySelectorAll(".sv-sugestao")).toHaveLength(3);
  });
  it("o líquido exibido bate com a conta de taxas (300 -> 261)", () => {
    // 300 pagos: base 261 + floor(26.1)=26 + floor(13.05)=13 = 300
    const { el } = abrir();
    const eq = [...el.querySelectorAll(".sv-sugestao")].find((x) => x.textContent?.includes("Equilibrado"))!;
    expect(texto(eq)).toContain("recebe R$ 2.61");
  });
  it("preço abaixo do mínimo da Steam bloqueia o botão", () => {
    const { el } = abrir();
    const input = el.querySelector("input.sv-preco") as HTMLInputElement;
    const botao = el.querySelector("button.sv-usar") as HTMLButtonElement;
    input.value = "0,02";
    input.dispatchEvent(new Event("input"));
    expect(botao.disabled).toBe(true);
    input.value = "3,00";
    input.dispatchEvent(new Event("input"));
    expect(botao.disabled).toBe(false);
  });
  it("usar o preço chama aoSelecionar com o preço do comprador em centavos", () => {
    const { el, aoSelecionar } = abrir();
    (el.querySelector(".sv-sugestao button") as HTMLButtonElement).click();
    expect(aoSelecionar).toHaveBeenCalledWith(250);
  });
});
