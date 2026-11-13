/**
 * Configurações da extensão: por enquanto, o idioma. O mesmo seletor aparece no menu do logo do painel
 * e na página de configurações (ícone da extensão / about:addons).
 */
import { IDIOMAS, tx, type Idioma } from "../core/i18n.ts";

/** Grupo de opções de idioma (radiogroup com setas do teclado). */
export function renderSeletorIdioma(el: HTMLElement, atual: Idioma, aoEscolher: (i: Idioma) => void): void {
  const doc = el.ownerDocument;
  const grupo = doc.createElement("div");
  grupo.className = "sv-idiomas";
  grupo.setAttribute("role", "radiogroup");
  grupo.setAttribute("aria-label", tx().idioma);
  const botoes = IDIOMAS.map(({ id, nome }) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "sv-idioma";
    b.setAttribute("role", "radio");
    b.lang = id;
    b.dataset.idioma = id;
    b.textContent = nome;
    return b;
  });
  const marcar = (i: Idioma) => {
    for (const b of botoes) {
      const sim = b.dataset.idioma === i;
      b.setAttribute("aria-checked", String(sim));
      b.tabIndex = sim ? 0 : -1;
    }
  };
  const escolher = (i: Idioma, focar = false) => {
    marcar(i);
    if (focar) botoes.find((b) => b.dataset.idioma === i)?.focus();
    aoEscolher(i);
  };
  botoes.forEach((b, n) => {
    b.addEventListener("click", () => escolher(b.dataset.idioma as Idioma));
    b.addEventListener("keydown", (e) => {
      const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!passo) return;
      e.preventDefault();
      const alvo = IDIOMAS[(n + passo + IDIOMAS.length) % IDIOMAS.length] as (typeof IDIOMAS)[number];
      escolher(alvo.id, true);
    });
  });
  marcar(atual);
  grupo.append(...botoes);
  el.replaceChildren(grupo);
}

export interface MenuAjustes {
  fechar(): void;
}

/** Menu que abre ao clicar no logo do painel, logo abaixo dele. */
export function montarMenuAjustes(
  botao: HTMLElement,
  raiz: HTMLElement | ShadowRoot,
  op: { atual: () => Idioma; aoEscolher: (i: Idioma) => void; rodape?: string },
): MenuAjustes {
  const doc = botao.ownerDocument;
  const menu = doc.createElement("div");
  menu.className = "sv-menu";
  menu.setAttribute("role", "dialog");
  menu.hidden = true;
  botao.setAttribute("aria-haspopup", "dialog");
  botao.setAttribute("aria-expanded", "false");
  raiz.append(menu);

  const preencher = () => {
    menu.setAttribute("aria-label", tx().configuracoes);
    const titulo = doc.createElement("div");
    titulo.className = "sv-menu-titulo";
    titulo.textContent = tx().idioma;
    const seletor = doc.createElement("div");
    renderSeletorIdioma(seletor, op.atual(), (i) => {
      op.aoEscolher(i);
      // os rótulos do menu acompanham a troca; o foco fica na opção escolhida
      titulo.textContent = tx().idioma;
      menu.setAttribute("aria-label", tx().configuracoes);
    });
    menu.replaceChildren(titulo, seletor);
    if (op.rodape) {
      const rodape = doc.createElement("div");
      rodape.className = "sv-menu-rodape";
      rodape.textContent = op.rodape;
      menu.append(rodape);
    }
  };
  const abrir = () => {
    preencher();
    menu.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    menu.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
  };
  const fechar = (devolverFoco = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    botao.setAttribute("aria-expanded", "false");
    if (devolverFoco) botao.focus();
  };
  botao.addEventListener("click", () => (menu.hidden ? abrir() : fechar()));
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      fechar(true);
    }
  });
  return { fechar: () => fechar() };
}
