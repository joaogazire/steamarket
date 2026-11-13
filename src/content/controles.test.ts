import { describe, expect, it, vi } from "vitest";
import { renderControles } from "./controles.ts";

const montar = (extra = {}) => {
  const el = document.createElement("div");
  const aoMudar = vi.fn();
  document.body.append(el); // a ativação de checkbox só dispara change com o elemento conectado
  const ctl = renderControles(el, { aoMudar, ...extra });
  const caixa = (rot: string) => [...el.querySelectorAll("label")].find((l) => l.textContent?.includes(rot))!.querySelector("input") as HTMLInputElement;
  return { el, aoMudar, ctl, caixa };
};

describe("renderControles", () => {
  it("começa com as duas desligadas: clicar para ver um item não pode listar sem querer (code-review)", () => {
    const { caixa } = montar();
    expect(caixa("Ocultar itens já listados").checked).toBe(false);
    expect(caixa("Listar ao clicar").checked).toBe(false);
  });
  it("mudar uma caixa avisa com o estado das duas", () => {
    const { caixa, aoMudar } = montar();
    caixa("Ocultar itens já listados").click();
    expect(aoMudar).toHaveBeenLastCalledWith({ ocultarListados: true, cliqueLista: false });
    caixa("Listar ao clicar").click();
    expect(aoMudar).toHaveBeenLastCalledWith({ ocultarListados: true, cliqueLista: true });
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
