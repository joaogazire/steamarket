declare const __BUILD__: string | undefined;
import icone from "../../icons/icone-32.png";
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
  // 1ª linha: logo da extensão (a versão da build fica só na dica, para conferir recargas).
  const logo = doc.createElement("div");
  logo.className = "sv-logo";
  if (typeof __BUILD__ === "string") logo.title = `build ${__BUILD__}`;
  const img = doc.createElement("img");
  img.src = icone;
  img.alt = "";
  const nome = doc.createElement("span");
  nome.textContent = "steamarket";
  logo.append(img, nome);
  const conteudo = doc.createElement("div");
  conteudo.className = "sv-conteudo";
  const aviso = doc.createElement("div");
  aviso.className = "sv-aviso";
  aviso.hidden = true;
  raiz.append(logo, conteudo, aviso);
  // Ao lado do logo do jogo; sem essa área (layout antigo), antes da grade.
  const logos = doc.querySelector("#inventory_logos");
  const ancora = doc.querySelector("#inventories");
  if (logos) logos.append(el);
  else if (ancora) ancora.before(el);
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

/**
 * Põe o painel na coluna da caixa de detalhes do item (.inventory_page_right), à direita do logo do jogo.
 * Sem essa caixa visível (tela estreita), deixa o painel no fluxo normal, abaixo do logo.
 */
export function posicionar(host: HTMLElement, doc: Document): void {
  const logos = host.parentElement;
  const direita = doc.querySelector(".inventory_page_right");
  const r = direita?.getBoundingClientRect();
  if (!logos || logos.id !== "inventory_logos" || !r || r.width < 200) {
    host.style.position = "";
    host.style.left = host.style.top = host.style.width = "";
    return;
  }
  const base = logos.getBoundingClientRect();
  logos.style.position = "relative";
  host.style.position = "absolute";
  host.style.top = "0px";
  host.style.left = `${Math.round(r.left - base.left)}px`;
  host.style.width = `${Math.round(r.width)}px`;
  // a área do logo cresce se o painel for mais alto que ela
  const alto = host.offsetHeight;
  if (alto > 0) logos.style.minHeight = `${alto}px`;
}
