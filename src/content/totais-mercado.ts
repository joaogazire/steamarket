/** Total no título de "My sell listings": o que está anunciado (preço do comprador) e quanto cai para o vendedor. */
import { tx } from "../core/i18n.ts";
import type { Total, TotalSugerido } from "../core/totais-anuncios.ts";
import { reais } from "../core/total.ts";
import { acharTituloVendas } from "./logo-mercado.ts";
import { criarAnel } from "./anel.ts";

export interface EstadoTotais {
  anunciado: Total;
  /** soma dos preços sugeridos; null = ainda sem nenhum */
  sugerido: TotalSugerido | null;
  /** histórico dos itens: feitos / total (para o "calculando") */
  progresso: { feitos: number; total: number } | null;
}

export interface Totais {
  atualizar(e: EstadoTotais): void;
}

const CHIP = "display:inline-flex;align-items:baseline;gap:6px;padding:3px 10px;border-radius:8px;background:rgba(255,255,255,.06);font-size:12px;line-height:1.4;white-space:nowrap;color:#8f98a0;";
const VALOR = "color:#fff;font-weight:600;";
const RECEBO = "color:#a4d007;font-weight:600;";

const ouCria = (doc: Document, pai: HTMLElement, classe: string, antes: Element | null, extra = ""): HTMLElement => {
  let el = pai.querySelector<HTMLElement>(`.${classe}`);
  if (!el) {
    el = doc.createElement("span");
    el.className = classe;
    el.style.cssText = CHIP + extra;
    if (antes) pai.insertBefore(el, antes);
    else pai.append(el);
  }
  return el;
};

function span(doc: Document, texto: string, estilo = ""): HTMLElement {
  const s = doc.createElement("span");
  s.textContent = texto;
  if (estilo) s.style.cssText = estilo;
  return s;
}

export function montarTotais(doc: Document): Totais | null {
  const titulo = acharTituloVendas(doc);
  if (!titulo) return null;
  const a = ouCria(doc, titulo, "sv-tot-anunciado", titulo.querySelector("#sv-logo-mercado"), "margin-left:10px;");
  const sug = ouCria(doc, titulo, "sv-tot-sugerido", titulo.querySelector("#sv-logo-mercado"), "margin-left:auto;");
  // o chip do steamarket gruda no logo, à direita; o espaço livre fica entre ele e o total anunciado
  const logo = titulo.querySelector<HTMLElement>("#sv-logo-mercado");
  if (logo) logo.style.marginLeft = "8px";
  return {
    atualizar(e) {
      a.replaceChildren(
        span(doc, tx().totAnunciado),
        span(doc, reais(e.anunciado.preco), VALOR),
        span(doc, `· ${tx().totRecebo}`),
        span(doc, reais(e.anunciado.liquido), RECEBO),
      );
      a.title = tx().totDicaAnunciado(e.anunciado.n);
      sug.hidden = !e.sugerido;
      if (e.sugerido) {
        const filhos = [
          span(doc, tx().totSugerido),
          span(doc, reais(e.sugerido.preco), VALOR),
          span(doc, `· ${tx().totRecebo}`),
          span(doc, reais(e.sugerido.liquido), RECEBO),
        ];
        if (e.progresso && e.progresso.feitos < e.progresso.total) {
          const anel = criarAnel(doc);
          anel.definir(e.progresso.feitos, e.progresso.total);
          anel.el.style.alignSelf = "center";
          filhos.push(anel.el);
        }
        sug.replaceChildren(...filhos);
        sug.title = tx().totDicaSugerido(e.sugerido.n, e.sugerido.faltam);
      }
    },
  };
}
