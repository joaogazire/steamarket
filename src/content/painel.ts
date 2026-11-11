import type { ContextoPagina } from "./contexto.ts";

export interface Painel {
  /** o elemento hospedeiro no DOM da página; o conteúdo vive num shadow root fechado */
  el: HTMLElement;
  raiz: ShadowRoot;
  conteudo: HTMLElement;
  trocarJogo(id: string): void;
  jogoAtual(): string | null;
  avisar(texto: string | null): void;
}

const montados = new WeakMap<Element, Painel>();

/** INV-01: monta o painel só no próprio inventário, uma única vez por página. */
export function montarPainel(doc: Document, ctx: ContextoPagina, enviar: (m: unknown) => void): Painel | null {
  if (!ctx.proprio) return null;
  const existente = doc.querySelector("#sv-painel");
  if (existente) return montados.get(existente) ?? null;

  // Shadow root fechado: o JS da página não alcança os botões nem os campos do painel.
  const el = doc.createElement("section");
  el.id = "sv-painel";
  const raiz = el.attachShadow({ mode: "closed" });
  const titulo = doc.createElement("h2");
  titulo.textContent = "Steam Vendas";
  const aviso = doc.createElement("div");
  aviso.className = "sv-aviso";
  aviso.hidden = true;
  const conteudo = doc.createElement("div");
  conteudo.className = "sv-conteudo";
  raiz.append(titulo, aviso, conteudo);
  const ancora = doc.querySelector("#inventories");
  if (ancora) ancora.before(el);
  else doc.body.prepend(el);

  let atual: string | null = null;
  const painel: Painel = {
    el,
    raiz,
    conteudo,
    trocarJogo(id) {
      if (atual && atual !== id) enviar({ tipo: "cancelar", grupoId: atual });
      atual = id;
    },
    jogoAtual: () => atual,
    avisar(texto) {
      aviso.hidden = texto === null;
      aviso.textContent = texto ?? "";
    },
  };
  montados.set(el, painel);
  return painel;
}
