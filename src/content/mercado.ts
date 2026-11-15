/** Página /market da Steam: coluna com o preço sugerido pelo perfil, à direita de PRICE nos anúncios ativos. */
import { liquido } from "../core/taxas.ts";
import { reais } from "../core/total.ts";
import { tx } from "../core/i18n.ts";
import type { RegraTaxa } from "../core/tipos.ts";
import { textoParaCentavos } from "../steam/cliente.ts";
import { lerDataListagem, type Direcao } from "../core/ordem-anuncios.ts";
import { formatarVariacao, variacaoPct } from "../core/variacao.ts";

export interface AnuncioLinha {
  row: HTMLElement;
  appid: string;
  nome: string;
  /** o que o comprador paga hoje (centavos); null se não deu para ler */
  preco: number | null;
}

export interface SugestaoMercado {
  preco: number;
  base: string;
}

/** Só o link do próprio item da Steam: https://steamcommunity.com/market/listings/<appid>/<nome>. */
function lerLink(href: string | null): { appid: string; nome: string } | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href, "https://steamcommunity.com/");
  } catch {
    return null;
  }
  if (u.origin !== "https://steamcommunity.com") return null;
  const m = /^\/market\/listings\/(\d{1,7})\/([^/]+)$/.exec(u.pathname);
  if (!m) return null;
  let nome: string;
  try {
    nome = decodeURIComponent(m[2] as string);
  } catch {
    return null;
  }
  return nome.length > 0 && nome.length <= 300 ? { appid: m[1] as string, nome } : null;
}

function lerPreco(row: HTMLElement): number | null {
  const cel = row.querySelector(".market_listing_my_price");
  if (!cel) return null;
  const alvo = cel.querySelector("span[title]") ?? [...cel.querySelectorAll("span")].find((s) => !s.querySelector("span") && /\d/.test(s.textContent ?? ""));
  return textoParaCentavos(alvo?.textContent?.trim());
}

/** Anúncios ativos da página (as linhas `mylisting_<n>`), com o item de cada um. */
export function lerAnuncios(doc: Document): AnuncioLinha[] {
  const saida: AnuncioLinha[] = [];
  for (const row of doc.querySelectorAll<HTMLElement>(".market_listing_row[id^='mylisting_']")) {
    const link = lerLink(row.querySelector("a.market_listing_item_name_link, .market_listing_item_name a")?.getAttribute("href") ?? null);
    if (!link) continue;
    saida.push({ row, ...link, preco: lerPreco(row) });
  }
  return saida;
}

const LARG_PERFIL = 108;
const LARG_ULTIMAS = 100;
const LARG_PCT = 64;
/** Texto compacto de 13 px/11 px com entrelinha fixa: a linha da Steam não cresce por causa das colunas novas. */
const base = (larg: number) => `float:right;width:${larg}px;box-sizing:border-box;text-align:center;font-size:13px;line-height:1.35;`;
/** cabeçalho: uma linha só, com reticências se o texto não couber (nunca invade a coluna vizinha) */
const estiloCab = (larg: number) => `${base(larg)}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
const ESTILO_CAB = estiloCab(LARG_PERFIL);

/** As células novas nascem com o mesmo espaçamento vertical (só margem e padding) da célula PRICE da Steam: alinham na linha sem aumentar a altura dela. */
function espelharPreco(el: HTMLElement, ref: Element | null, cabecalho = false): void {
  if (!ref || typeof getComputedStyle !== "function") return;
  const cs = getComputedStyle(ref);
  // cabeçalho: mesma fonte e entrelinha do PRICE nativo (irmão na mesma barra, a altura não muda); linhas: só espaçamento
  const props = cabecalho
    ? (["paddingTop", "paddingBottom", "marginTop", "marginBottom", "fontSize", "lineHeight"] as const)
    : (["paddingTop", "paddingBottom", "marginTop", "marginBottom"] as const);
  for (const k of props) {
    const v = cs[k];
    if (v && v !== "auto" && v !== "normal") el.style[k] = v;
  }
}

/**
 * Ordem na tela (esquerda → direita): PRICE, últimas vendas, %, perfil. As células da Steam são `float: right`, então no DOM
 * a ordem é a inversa. `seguintes` são as colunas que ficam à ESQUERDA da nova (vêm depois no DOM); sem nenhuma, entra antes do PRICE.
 */
function inserirOrdenado(pai: Element, el: HTMLElement, seguintes: string[], preco: Element | null): void {
  for (const sel of seguintes) {
    const x = pai.querySelector(`:scope > ${sel}`);
    if (x) {
      pai.insertBefore(el, x);
      return;
    }
  }
  pai.insertBefore(el, preco);
}

const headerDe = (row: HTMLElement): HTMLElement | null =>
  (row.closest(".my_listing_section, .market_home_listing_table, .market_content_block") ?? row.parentElement)?.querySelector<HTMLElement>(".market_listing_table_header") ?? null;

function cabecalho(doc: Document, row: HTMLElement, perfil: string): void {
  const tabela = row.closest(".my_listing_section, .market_home_listing_table, .market_content_block") ?? row.parentElement;
  const header = tabela?.querySelector<HTMLElement>(".market_listing_table_header");
  const preco = header?.querySelector(".market_listing_my_price");
  if (!header || !preco) return;
  let cab = header.querySelector<HTMLElement>(".sv-merc-cab");
  if (!cab) {
    cab = doc.createElement("span");
    cab.className = "market_listing_right_cell sv-merc-cab";
    cab.style.cssText = `${ESTILO_CAB}cursor:pointer;`;
    espelharPreco(cab, preco, true);
    inserirOrdenado(header, cab, [".sv-merc-cab-pct", ".sv-merc-cab-med"], preco);
  }
  let rotulo = cab.querySelector<HTMLElement>(".sv-rot");
  if (!rotulo) {
    rotulo = doc.createElement("span");
    rotulo.className = "sv-rot";
    cab.prepend(rotulo);
  }
  rotulo.textContent = perfil;
}

/** Célula da linha: no DOM antes da célula PRICE, porque as células da Steam são `float: right`. */
function celula(doc: Document, row: HTMLElement): HTMLElement | null {
  let cel = row.querySelector<HTMLElement>(".sv-merc-cel");
  if (cel) return cel;
  const preco = row.querySelector(".market_listing_my_price");
  if (!preco) return null;
  cel = doc.createElement("div");
  cel.className = "market_listing_right_cell sv-merc-cel";
  cel.style.cssText = base(LARG_PERFIL);
  espelharPreco(cel, preco);
  inserirOrdenado(row, cel, [".sv-merc-pct", ".sv-merc-med"], preco);
  return cel;
}

export function marcarCarregando(doc: Document, a: AnuncioLinha, perfil: string): void {
  cabecalho(doc, a.row, perfil);
  const cel = celula(doc, a.row);
  if (!cel) return;
  cel.textContent = "…";
  cel.removeAttribute("data-estado");
  cel.title = "";
}

const COR = { sobe: "#a4d007", desce: "#e8a33d", ok: "#c6d4df" } as const;

/** Escreve (ou troca) a sugestão da linha; `null` = sem histórico para sugerir. */
export function escreverSugestao(doc: Document, a: AnuncioLinha, s: SugestaoMercado | null, perfil: string, regra: RegraTaxa): void {
  cabecalho(doc, a.row, perfil);
  const cel = celula(doc, a.row);
  if (!cel) return;
  cel.replaceChildren();
  if (!s) {
    cel.textContent = "—";
    cel.title = tx().mercadoSemHistorico;
    cel.dataset.estado = "sem";
    delete cel.dataset.sug;
    return;
  }
  const estado = a.preco === null ? "ok" : s.preco > a.preco * 1.03 ? "sobe" : s.preco < a.preco * 0.97 ? "desce" : "ok";
  cel.dataset.estado = estado;
  cel.dataset.sug = String(s.preco);
  cel.title = `${s.base} · ${tx().mercadoDica[estado]}`;
  const seta = estado === "sobe" ? "▲ " : estado === "desce" ? "▼ " : "";
  const topo = doc.createElement("span");
  topo.textContent = `${seta}${reais(s.preco)}`;
  topo.style.color = COR[estado];
  cel.append(topo, doc.createElement("br"));
  let liq: number | null = null;
  try {
    liq = liquido(s.preco, regra);
  } catch {
    liq = null;
  }
  const baixo = doc.createElement("span");
  baixo.textContent = liq === null ? "" : `(${reais(liq)})`;
  baixo.style.cssText = "color:#AFAFAF;font-size:11px;";
  cel.append(baixo);
  alinharComPreco(a.row, cel);
}

export type ChaveOrdem = "preco" | "data" | "sugerido";

/** Qual cabeçalho da tabela de anúncios recebeu o clique (PRICE, LISTED ON ou a coluna do perfil); null fora deles. */
export function chaveDoCabecalho(alvo: EventTarget | null): ChaveOrdem | null {
  const cel = alvo instanceof Element ? alvo.closest(".market_listing_table_header > span, .market_listing_table_header > div") : null;
  if (!cel) return null;
  if (cel.classList.contains("sv-merc-cab")) return "sugerido";
  if (cel.classList.contains("market_listing_my_price")) return "preco";
  if (cel.classList.contains("market_listing_listed_date")) return "data";
  return null;
}

/** Os cabeçalhos clicáveis ganham cursor de mão e dica; chamado a cada atualização da tabela. */
export function tornarClicaveis(doc: Document): void {
  for (const h of doc.querySelectorAll<HTMLElement>(".market_listing_table_header > .market_listing_my_price, .market_listing_table_header > .market_listing_listed_date")) {
    if (h.dataset.svOrd) continue;
    h.dataset.svOrd = "1";
    h.style.cursor = "pointer";
    h.title = tx().ordenarDica;
  }
}

const CLASSE_CHAVE: Record<ChaveOrdem, string> = { preco: ".market_listing_my_price", data: ".market_listing_listed_date", sugerido: ".sv-merc-cab" };

/** Seta ▲/▼ só no cabeçalho ordenado; `chave` null tira todas. */
export function marcarSeta(doc: Document, chave: ChaveOrdem | null, dir: Direcao): void {
  for (const x of doc.querySelectorAll(".sv-seta")) x.remove();
  if (!chave) return;
  for (const h of doc.querySelectorAll<HTMLElement>(`.market_listing_table_header > ${CLASSE_CHAVE[chave]}`)) {
    const seta = doc.createElement("span");
    seta.className = "sv-seta";
    seta.textContent = dir === "asc" ? "▲" : "▼";
    h.append(seta);
  }
}

export interface ValoresLinha {
  preco: number | null;
  data: number | null;
  sugerido: number | null;
}

export function valoresDaLinha(row: HTMLElement, agora: number): ValoresLinha {
  const dataTxt = row.querySelector(".market_listing_listed_date")?.textContent ?? "";
  const sug = Number(row.querySelector<HTMLElement>(".sv-merc-cel")?.dataset.sug);
  return { preco: lerPreco(row), data: lerDataListagem(dataTxt, agora), sugerido: Number.isFinite(sug) && sug > 0 ? sug : null };
}

/** Põe as linhas no contêiner na ordem dada (linhas de fora entram); o que não é linha (ex.: aviso) fica no fim. */
export function colocarLinhas(container: HTMLElement, linhas: HTMLElement[]): void {
  const resto = [...container.children].filter((c) => !c.classList.contains("market_listing_row"));
  container.append(...linhas, ...resto);
}

const CSS_RELISTAR = `
:host { all: initial; }
button { all: unset; box-sizing: border-box; padding: 4px 12px; border-radius: 8px; background: #5c7e10; color: #fff;
  font: 600 12px/1.3 "Motiva Sans", Arial, sans-serif; white-space: nowrap; cursor: pointer;
  transition: background .18s cubic-bezier(.2,.8,.2,1), transform .12s cubic-bezier(.2,.8,.2,1); }
button:hover { background: #79a51a; }
button:active { transform: scale(.94); }
button:focus-visible { outline: 2px solid #a4d007; outline-offset: 2px; }
button[aria-disabled="true"] { background: #3d4450; color: #c6d4df; cursor: default; transform: none; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }`;

const botoesRelistar = new WeakMap<Element, HTMLButtonElement>();

/**
 * Botão "Relistar" ao lado do Remove, no visual do steamarket. Vive num shadow root fechado (o CSS da Steam não o alcança)
 * e fica posicionado à direita do texto "Remove", centralizado na altura da linha. Cria uma vez; `preco` (comprador,
 * centavos) vai na dica; null esconde o botão. O host leva `title`, `hidden`, `aria-disabled` e `data-rotulo`.
 */
export function mostrarRelistar(doc: Document, row: HTMLElement, preco: number | null, aoClicar: (confiavel: boolean) => void): HTMLElement | null {
  const cel = row.querySelector<HTMLElement>(".market_listing_edit_buttons");
  if (!cel) return null;
  let host = cel.querySelector<HTMLElement>(".sv-relistar");
  if (!host) {
    host = doc.createElement("span");
    host.className = "sv-relistar";
    host.style.cssText = "position:absolute;left:calc(50% + 44px);top:50%;transform:translateY(-50%);";
    if (!cel.style.position) cel.style.position = "relative";
    const raiz = host.attachShadow({ mode: "closed" });
    const estilo = doc.createElement("style");
    estilo.textContent = CSS_RELISTAR;
    const botao = doc.createElement("button");
    botao.type = "button";
    raiz.append(estilo, botao);
    botoesRelistar.set(host, botao);
    const alvo = host;
    botao.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (alvo.getAttribute("aria-disabled") !== "true") aoClicar(e.isTrusted); // quem decide se vale clique não confiável é o chamador
    });
    cel.append(host);
    rotular(host, tx().relistar);
  }
  host.hidden = preco === null;
  host.title = preco === null ? "" : `${tx().relistarPor(reais(preco))} · ${tx().relistarDica}`;
  return host;
}

function rotular(host: HTMLElement, texto: string): void {
  host.dataset.rotulo = texto;
  const b = botoesRelistar.get(host);
  if (b) b.textContent = texto;
}

/** Rótulo do botão durante o trabalho / resultado; `texto` null volta ao padrão. */
export function textoRelistar(row: HTMLElement, texto: string | null, ocupado: boolean): void {
  const host = row.querySelector<HTMLElement>(".sv-relistar");
  if (!host) return;
  rotular(host, texto ?? tx().relistar);
  const b = botoesRelistar.get(host);
  if (ocupado) {
    host.setAttribute("aria-disabled", "true");
    b?.setAttribute("aria-disabled", "true");
  } else {
    host.removeAttribute("aria-disabled");
    b?.removeAttribute("aria-disabled");
  }
}

/** Cria (uma vez) o cabeçalho e a célula de uma coluna extra, na ordem da tela. */
function colunaExtra(
  doc: Document,
  row: HTMLElement,
  c: { cab: string; cel: string; larg: number; rotulo: string; dica?: string; seguemCab: string[]; seguemCel: string[] },
): HTMLElement | null {
  const header = headerDe(row);
  const precoCab = header?.querySelector<HTMLElement>(".market_listing_my_price") ?? null;
  if (header && precoCab && !header.querySelector(`.${c.cab}`)) {
    const cab = doc.createElement("span");
    cab.className = `market_listing_right_cell ${c.cab}`;
    cab.style.cssText = estiloCab(c.larg);
    espelharPreco(cab, precoCab, true);
    cab.textContent = c.rotulo;
    if (c.dica) cab.title = c.dica;
    inserirOrdenado(header, cab, c.seguemCab, precoCab);
  }
  let cel = row.querySelector<HTMLElement>(`.${c.cel}`);
  if (cel) return cel;
  const preco = row.querySelector(".market_listing_my_price");
  if (!preco) return null;
  cel = doc.createElement("div");
  cel.className = `market_listing_right_cell ${c.cel}`;
  cel.style.cssText = base(c.larg);
  espelharPreco(cel, preco);
  inserirOrdenado(row, cel, c.seguemCel, preco);
  return cel;
}

const colunaMedia = (doc: Document, row: HTMLElement): HTMLElement | null =>
  colunaExtra(doc, row, { cab: "sv-merc-cab-med", cel: "sv-merc-med", larg: LARG_ULTIMAS, rotulo: tx().mediaCab, seguemCab: [], seguemCel: [] });

const COR_VAR = { sobe: "#a4d007", desce: "#e8a33d", ok: "#c6d4df" } as const;

/** Coluna "%": variação do preço anunciado para a média das últimas vendas ((últimas − preço) / preço). */
export function escreverVariacao(doc: Document, a: AnuncioLinha, preco: number | null, ultimas: number | null): void {
  const cel = colunaExtra(doc, a.row, {
    cab: "sv-merc-cab-pct", cel: "sv-merc-pct", larg: LARG_PCT, rotulo: "%", dica: tx().variacaoDica, seguemCab: [".sv-merc-cab-med"], seguemCel: [".sv-merc-med"],
  });
  if (!cel) return;
  const v = variacaoPct(preco, ultimas);
  cel.replaceChildren();
  if (v === null) {
    cel.textContent = "—";
    cel.dataset.estado = "sem";
    cel.title = tx().variacaoDica;
    return;
  }
  const estado = v >= 3 ? "sobe" : v <= -3 ? "desce" : "ok";
  cel.dataset.estado = estado;
  cel.title = `${tx().variacaoDica} · ${estado === "sobe" ? tx().variacaoSobe : estado === "desce" ? tx().variacaoDesce : tx().variacaoOk}`;
  const t = doc.createElement("span");
  t.textContent = formatarVariacao(v);
  t.style.cssText = `color:${COR_VAR[estado]};font-weight:600;`;
  cel.append(t);
  alinharComPreco(a.row, cel);
}

/** Média das últimas vendas do dia (`null` = sem vendas nas últimas 24 h). */
export function escreverMedia(doc: Document, a: AnuncioLinha, m: { preco: number; amostra: number } | null): void {
  const cel = colunaMedia(doc, a.row);
  if (!cel) return;
  cel.replaceChildren();
  cel.title = m ? tx().mediaDica(m.amostra) : tx().mediaSem;
  if (!m) {
    cel.textContent = "—";
    return;
  }
  // duas linhas, como PRICE e a coluna do perfil: preço em cima, base da média (quantas vendas) em cinza embaixo
  const topo = doc.createElement("span");
  topo.textContent = reais(m.preco);
  const baixo = doc.createElement("span");
  baixo.textContent = tx().mediaVendas(m.amostra);
  baixo.style.cssText = "color:#8f98a0;font-size:11px;";
  cel.append(topo, doc.createElement("br"), baixo);
  alinharComPreco(a.row, cel);
}

/**
 * Centraliza o conteúdo da célula no mesmo eixo vertical do preço nativo da Steam (medido na tela, não adivinhado):
 * ajusta o padding de cima pela diferença entre os centros. Sem layout (aba escondida, testes) não faz nada.
 */
export function alinharComPreco(row: HTMLElement, cel: HTMLElement): void {
  const nativo = row.querySelector<HTMLElement>(".market_listing_my_price .market_listing_price, .market_listing_my_price");
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  if (!nativo || !raf) return;
  raf(() => {
    const n = nativo.getBoundingClientRect();
    const c = cel.getBoundingClientRect();
    if (n.height === 0 || c.height === 0) return;
    const cs = getComputedStyle(cel);
    const topo = Number.parseFloat(cs.paddingTop) || 0;
    const base = Number.parseFloat(cs.paddingBottom) || 0;
    const centroCel = (c.top + topo + (c.bottom - base)) / 2;
    const delta = n.top + n.height / 2 - centroCel;
    if (Math.abs(delta) >= 0.5) cel.style.paddingTop = `${Math.max(0, topo + delta)}px`;
  });
}

export interface LinhaLida {
  /** appid:nome do item; null se a linha não tem o link do item */
  chave: string | null;
  preco: number;
  /** o que o vendedor recebe (a linha em parênteses do PRICE) */
  liquido: number | null;
}

/** Todas as linhas de anúncio de um documento (a página ou o HTML de outra página de /market/mylistings), para somar. */
export function lerLinhasTotais(doc: Document): LinhaLida[] {
  const saida: LinhaLida[] = [];
  for (const row of doc.querySelectorAll<HTMLElement>(".market_listing_row[id^='mylisting_']")) {
    const preco = lerPreco(row);
    if (preco === null) continue;
    const titulos = row.querySelectorAll(".market_listing_my_price span[title]");
    const liquido = textoParaCentavos(titulos[1]?.textContent?.trim());
    const link = lerLink(row.querySelector("a.market_listing_item_name_link, .market_listing_item_name a")?.getAttribute("href") ?? null);
    saida.push({ chave: link ? `${link.appid}:${link.nome}` : null, preco, liquido });
  }
  return saida;
}

/** appid:nome do anúncio `mylisting_<id>` num documento de /market/mylistings; null se não está nele. */
export function chaveDoAnuncio(doc: Document, listingId: string): string | null {
  if (!/^\d{1,25}$/.test(listingId)) return null;
  const row = doc.getElementById(`mylisting_${listingId}`);
  const link = lerLink(row?.querySelector("a.market_listing_item_name_link, .market_listing_item_name a")?.getAttribute("href") ?? null);
  return link ? `${link.appid}:${link.nome}` : null;
}
