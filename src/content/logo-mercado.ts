/** Logo do steamarket na página /market, à direita do título "My sell listings": abre o menu de idioma e perfil. */
import icone from "../../icons/icone-32.png";
import { tx } from "../core/i18n.ts";
import cssPainel from "./estilo.css";
import { montarMenuAjustes, type MenuAjustes } from "./ajustes.ts";
import type { Idioma } from "../core/i18n.ts";
import type { Perfil } from "../core/preco-paciente.ts";

const SEL_LINHA = ".market_listing_row[id^='mylisting_']";

/** O título da seção de anúncios à venda (não a de "aguardando confirmação"). */
export function acharTituloVendas(doc: Document): HTMLElement | null {
  const porId = doc.getElementById("my_market_selllistings_number")?.closest<HTMLElement>(".my_market_header, h3, h2");
  if (porId) return porId;
  const secoes = [...doc.querySelectorAll<HTMLElement>(".my_listing_section")].filter((s) => s.querySelector(SEL_LINHA));
  return secoes.at(-1)?.querySelector<HTMLElement>(".my_market_header, h3, h2") ?? null;
}

export interface LogoMercado {
  el: HTMLElement;
  logo: HTMLButtonElement;
  menu: MenuAjustes;
}

export function montarLogoMercado(
  doc: Document,
  op: { atual: () => Idioma; aoEscolher: (i: Idioma) => void; perfil: () => Perfil; aoEscolherPerfil: (p: Perfil) => void; rodape?: string },
): LogoMercado | null {
  if (doc.getElementById("sv-logo-mercado")) return null;
  const titulo = acharTituloVendas(doc);
  if (!titulo) return null;
  const el = doc.createElement("span");
  el.id = "sv-logo-mercado";
  // O título vira uma linha flex: texto, contador e logo no mesmo eixo vertical; o logo vai para a direita.
  titulo.style.display = "flex";
  titulo.style.alignItems = "center";
  titulo.style.gap = ".3em";
  el.style.cssText = "margin-left:auto;margin-block:-4px;margin-right:4px;";
  const raiz = el.attachShadow({ mode: "closed" }); // o JS da página não alcança o menu
  const estilo = doc.createElement("style");
  estilo.textContent = cssPainel;
  const logo = doc.createElement("button");
  logo.type = "button";
  logo.className = "sv-logo";
  logo.setAttribute("aria-label", tx().dicaLogo);
  const img = doc.createElement("img");
  img.src = icone;
  img.alt = "steamarket";
  logo.append(img);
  raiz.append(estilo, logo);
  titulo.append(el);
  const menu = montarMenuAjustes(logo, raiz, op);
  doc.addEventListener("click", (e) => {
    if (!e.composedPath().includes(el)) menu.fechar();
  });
  return { el, logo, menu };
}
