import icone from "../../icons/icone-32.png";
import { tx } from "../core/i18n.ts";
import type { ContextoPagina } from "./contexto.ts";

export interface Painel {
  /** o elemento hospedeiro no DOM da página; o conteúdo vive num shadow root fechado */
  el: HTMLElement;
  raiz: ShadowRoot;
  conteudo: HTMLElement;
  /** o logo da extensão é o botão das configurações */
  logo: HTMLButtonElement;
  /** refaz os textos do painel depois de trocar o idioma */
  atualizarTextos(): void;
  /** à direita: status e totais */
  resumo: HTMLElement;
  trocarJogo(id: string): void;
  jogoAtual(): string | null;
  /** tipo "ok": confirmação de sucesso (verde); sem tipo: alerta (amarelo) */
  avisar(texto: string | null, tipo?: "ok"): void;
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
  // Logo da extensão, só o ícone; é o botão das configurações (a versão da build fica no menu).
  const logo = doc.createElement("button");
  logo.type = "button";
  logo.className = "sv-logo";
  const img = doc.createElement("img");
  img.src = icone;
  img.alt = "steamarket"; // só o ícone na tela (pedido 13/11)
  logo.append(img);
  // Disposição 4 (escolhida em 13/11): tudo encostado à direita, empilhado.
  // Em cima: chave, ícones e o logo no fim; embaixo, o resumo (status, total e barra de seleção).
  const conteudo = doc.createElement("div");
  conteudo.className = "sv-conteudo";
  const topo = doc.createElement("div");
  topo.className = "sv-topo";
  topo.append(conteudo, logo);
  const resumo = doc.createElement("div");
  resumo.className = "sv-resumo";
  const cabeca = doc.createElement("div");
  cabeca.className = "sv-cabeca";
  cabeca.append(topo, resumo);
  // O aviso flutua por cima (não empurra a página).
  const aviso = doc.createElement("div");
  aviso.className = "sv-aviso";
  aviso.hidden = true;
  raiz.append(cabeca, aviso);
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
    resumo,
    logo,
    atualizarTextos() {
      logo.dataset.dica = tx().dicaLogo;
      logo.setAttribute("aria-label", tx().dicaLogo);
    },
    trocarJogo(id) {
      if (atual && atual !== id) enviar({ tipo: "cancelar", grupoId: atual });
      atual = id;
    },
    jogoAtual: () => atual,
    avisar(texto, tipo) {
      aviso.hidden = texto === null;
      aviso.textContent = texto ?? "";
      aviso.classList.toggle("sv-ok", texto !== null && tipo === "ok");
    },
  };
  painel.atualizarTextos();
  montados.set(el, painel);
  return painel;
}

/**
 * Põe o painel à direita do logo do jogo, encostado na borda direita da caixa de detalhes do item,
 * ocupando o espaço livre até o logo. Nunca muda a altura da área do logo (a página não desce).
 * Sem essa caixa visível (tela estreita), deixa o painel no fluxo normal, abaixo do logo.
 */
/** Altura da linha de ícones (30) + espaço (6) + linha do total (22). */
const ALTURA_BASE = 58;

export function posicionar(host: HTMLElement, doc: Document): void {
  const logos = host.parentElement;
  const direita = doc.querySelector(".inventory_page_right");
  const r = direita?.getBoundingClientRect();
  if (logos?.id === "inventory_logos" && logos.style.minHeight) logos.style.minHeight = "";
  if (!logos || logos.id !== "inventory_logos" || !r || r.width < 200) {
    host.style.position = "";
    host.style.left = host.style.right = host.style.top = host.style.maxWidth = "";
    return;
  }
  const base = logos.getBoundingClientRect();
  logos.style.position = "relative";
  host.style.position = "absolute";
  // centraliza a linha de ícones e o total na área do logo; a barra de seleção cresce para baixo sem mexer neles
  host.style.top = `${Math.max(8, Math.round((base.height - ALTURA_BASE) / 2))}px`;
  host.style.left = "";
  host.style.right = `${Math.round(base.right - r.right)}px`;
  // largura: do fim do logo do jogo (+24 de folga) até a borda direita da caixa; sem o logo, a largura da caixa
  const img = doc.querySelector("#inventory_applogo")?.getBoundingClientRect();
  const livre = img && img.right > 0 && img.right < r.right ? r.right - img.right - 24 : 0;
  host.style.maxWidth = `${Math.round(livre > 0 ? livre : r.width)}px`;
}
