import type { Grupo } from "../core/tipos.ts";

export type EstadoLista =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; grupos: Grupo[] };

export interface CallbacksLista {
  aoExpandir(grupo: Grupo): void;
  aoTentar(): void;
}

/** INV-01 / INV-04. Todo texto entra por textContent, nunca como HTML. */
export function renderLista(el: HTMLElement, estado: EstadoLista, cb: CallbacksLista): void {
  const doc = el.ownerDocument;
  el.replaceChildren();
  if (estado.tipo === "carregando") {
    el.textContent = "carregando inventário…";
    return;
  }
  if (estado.tipo === "erro") {
    const msg = doc.createElement("p");
    msg.textContent = estado.mensagem;
    const b = doc.createElement("button");
    b.textContent = "tentar de novo";
    b.addEventListener("click", () => cb.aoTentar());
    el.append(msg, b);
    return;
  }
  if (estado.grupos.length === 0) {
    el.textContent = "nenhum item vendável";
    return;
  }
  for (const g of estado.grupos) {
    const linha = doc.createElement("div");
    linha.className = "sv-grupo";
    linha.tabIndex = 0;
    linha.setAttribute("role", "button");
    const nome = doc.createElement("span");
    nome.className = "sv-nome";
    nome.textContent = g.nome;
    const n = doc.createElement("span");
    n.className = "sv-contagem";
    n.textContent = `×${g.contagem}`;
    linha.append(nome, " ", n);
    linha.addEventListener("click", () => cb.aoExpandir(g));
    linha.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") cb.aoExpandir(g);
    });
    el.append(linha);
  }
}
