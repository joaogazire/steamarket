/**
 * Anel de progresso igual ao do inventário (controles.ts), com estilo inline: a página do mercado não carrega o estilo.css
 * fora do painel do logo. Some ao chegar a 100%.
 */
import { tx } from "../core/i18n.ts";

const NS = "http://www.w3.org/2000/svg";
const MUDO = "#8f98a0";
const LINHA = "rgba(255,255,255,.12)";
const VERDE = "#a4d007";

export interface Anel {
  el: HTMLElement;
  definir(feitos: number, total: number): void;
}

export function criarAnel(doc: Document): Anel {
  const el = doc.createElement("span");
  el.className = "sv-anel";
  el.hidden = true;
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.style.cssText = `display:inline-flex;align-items:center;gap:4px;vertical-align:middle;color:${MUDO};font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;`;
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.style.transform = "rotate(-90deg)";
  const fundo = doc.createElementNS(NS, "circle");
  const arco = doc.createElementNS(NS, "circle");
  for (const [c, cls, cor] of [[fundo, "sv-anel-fundo", LINHA], [arco, "sv-anel-arco", VERDE]] as const) {
    c.setAttribute("class", cls);
    c.setAttribute("cx", "10");
    c.setAttribute("cy", "10");
    c.setAttribute("r", "8");
    c.setAttribute("pathLength", "100");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", cor);
    c.setAttribute("stroke-width", "2.5");
    c.setAttribute("stroke-linecap", "round");
  }
  arco.setAttribute("stroke-dasharray", "0 100");
  arco.style.transition = "stroke-dasharray .4s ease";
  const pct = doc.createElement("span");
  svg.append(fundo, arco);
  el.append(svg, pct);
  return {
    el,
    definir(feitos, total) {
      el.hidden = total <= 0 || feitos >= total;
      if (el.hidden) return;
      const p = Math.floor((Math.max(0, feitos) / total) * 100);
      arco.setAttribute("stroke-dasharray", `${p} 100`);
      pct.textContent = `${p}%`;
      el.title = tx().itensDe(feitos, total);
      el.setAttribute("aria-valuenow", String(p));
    },
  };
}
