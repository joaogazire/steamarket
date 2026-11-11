import { describe, expect, it, vi } from "vitest";
import type { ResumoLote } from "../background/venda-lote.ts";
import { REGRA_PADRAO, type Ativo } from "../core/tipos.ts";
import { renderLote } from "./lote.ts";

const ativos: Ativo[] = ["1", "2", "3"].map((id) => ({ assetid: id, appid: 730, contextid: "2", market_hash_name: "x", marketable: true }));
const fmt = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
const texto = (el: Element) => el.textContent?.replace(/\s+/g, " ") ?? "";
const resumo = (p: Partial<ResumoLote> = {}): ResumoLote => ({ vendidos: 2, precisaConfirmar: 2, recusados: [{ assetid: "2", motivo: "anúncio duplicado" }], cancelado: false, abortado: null, ...p });

function montar(opcoes: { preco?: number; menorAnuncio?: number | null } = {}) {
  const el = document.createElement("div");
  let resolver!: (r: ResumoLote) => void;
  let progresso!: (k: number, n: number) => void;
  const cancelar = vi.fn();
  const iniciar = vi.fn((_escolhidos: Ativo[], _liquido: number, onProgresso: (k: number, n: number) => void) => {
    progresso = onProgresso;
    return { cancelar, concluido: new Promise<ResumoLote>((r) => (resolver = r)) };
  });
  renderLote(el, { ativos, precoComprador: opcoes.preco ?? 300, regra: REGRA_PADRAO, formatar: fmt, menorAnuncio: opcoes.menorAnuncio ?? 320, iniciar });
  const botao = (t: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === t) as HTMLButtonElement | undefined;
  return { el, iniciar, cancelar, botao, resolver: (r: ResumoLote) => resolver(r), progresso: (k: number, n: number) => progresso(k, n) };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe("renderLote SEL-02 / SEL-05 / SEL-06", () => {
  it("nada é enviado antes do clique de confirmação", () => {
    const { iniciar } = montar();
    expect(iniciar).not.toHaveBeenCalled();
  });
  it("confirmar envia a quantidade escolhida com o líquido (300 -> 261)", () => {
    const { el, iniciar, botao } = montar();
    const qtd = el.querySelector("input.sv-qtd") as HTMLInputElement;
    qtd.value = "2";
    qtd.dispatchEvent(new Event("input"));
    botao("Confirmar venda")!.click();
    expect(iniciar).toHaveBeenCalledTimes(1);
    const [escolhidos, liquido] = iniciar.mock.calls[0]!;
    expect(escolhidos.map((a) => a.assetid)).toEqual(["1", "2"]);
    expect(liquido).toBe(261);
  });
  it("a quantidade nunca passa do que há no grupo", () => {
    const { el, iniciar, botao } = montar();
    const qtd = el.querySelector("input.sv-qtd") as HTMLInputElement;
    qtd.value = "99";
    qtd.dispatchEvent(new Event("input"));
    botao("Confirmar venda")!.click();
    expect(iniciar.mock.calls[0]![0]).toHaveLength(3);
  });
  it("mostra 'k de N' e permite cancelar durante a fila", () => {
    const { el, botao, progresso, cancelar } = montar();
    botao("Confirmar venda")!.click();
    progresso(2, 3);
    expect(texto(el)).toContain("2 de 3");
    botao("cancelar")!.click();
    expect(cancelar).toHaveBeenCalledTimes(1);
  });
  it("resumo final mostra vendidos, recusados com motivo e o lembrete do celular", async () => {
    const { el, botao, resolver } = montar();
    botao("Confirmar venda")!.click();
    resolver(resumo());
    await esperar();
    const t = texto(el);
    expect(t).toContain("Vendidos 2");
    expect(t).toContain("Recusados 1");
    expect(t).toContain("anúncio duplicado");
    expect(t).toContain("celular");
  });
  it("preço abaixo de 50% do menor anúncio exige marcar o aviso", () => {
    const { el, botao } = montar({ preco: 100, menorAnuncio: 320 });
    expect(botao("Confirmar venda")!.disabled).toBe(true);
    const risco = el.querySelector("input.sv-risco") as HTMLInputElement;
    risco.checked = true;
    risco.dispatchEvent(new Event("change"));
    expect(botao("Confirmar venda")!.disabled).toBe(false);
  });
  it("pedido recusado pelo background mostra o erro e libera a tela de novo", async () => {
    const el = document.createElement("div");
    const iniciar = vi.fn(() => ({ cancelar: vi.fn(), concluido: Promise.reject(new Error("outro lote em andamento")) }));
    renderLote(el, { ativos, precoComprador: 300, regra: REGRA_PADRAO, formatar: fmt, menorAnuncio: 320, iniciar });
    const botao = [...el.querySelectorAll("button")].find((b) => b.textContent === "Confirmar venda") as HTMLButtonElement;
    botao.click();
    await esperar();
    expect(texto(el)).toContain("outro lote em andamento");
    expect(botao.disabled).toBe(false);
    expect([...el.querySelectorAll("button")].some((b) => b.textContent === "cancelar")).toBe(false);
  });
  it("com exigirCliqueReal, clique sintético não inicia a venda", () => {
    const el = document.createElement("div");
    const iniciar = vi.fn();
    renderLote(el, { ativos, precoComprador: 300, regra: REGRA_PADRAO, formatar: fmt, menorAnuncio: 320, iniciar, exigirCliqueReal: true });
    (el.querySelector("button") as HTMLButtonElement).click(); // click() sintético: isTrusted = false
    expect(iniciar).not.toHaveBeenCalled();
  });
  it("preço normal não pede o aviso", () => {
    const { el, botao } = montar({ preco: 300, menorAnuncio: 320 });
    expect(el.querySelector("input.sv-risco")).toBeNull();
    expect(botao("Confirmar venda")!.disabled).toBe(false);
  });
});
