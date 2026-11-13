/** Preço sugerido em cima do quadrado do item na grade da Steam e, à direita dele, o botão "Listar". */
import { tx } from "../core/i18n.ts";
const ID_ESTILO = "sv-estilo-overlay";
const FONTE = `600 11px/15px "Motiva Sans", Arial, sans-serif`;
// Quadrado: seleção ↖, preço ↗, quantidade ↙, Listar ↘.
const CSS = `.itemHolder.sv-oculto, .itemHolder.sv-agrupado { display: none !important; }
.item .sv-preco-item, .item .sv-qtd { position: absolute; z-index: 5; padding: 1px 5px; border-radius: 4px; background: rgba(14,20,27,.82); font: ${FONTE}; font-variant-numeric: tabular-nums; pointer-events: none; transition: opacity .25s; }
.item .sv-preco-item { right: 3px; top: 3px; color: #a4d007; }
.item .sv-preco-item.sv-listado { color: #66c0f4; }
.item .sv-preco-item.sv-pendente { color: #ffc82c; animation: none; }
.item .sv-preco-item.sv-ocupado { color: #c6d4df; animation: sv-pulso 1.1s ease-in-out infinite; }
.item .sv-qtd { left: 3px; bottom: 3px; color: #fff; }
.item .sv-acao { position: absolute; right: 3px; bottom: 3px; z-index: 6; margin: 0; padding: 1px 7px; border: 0; border-radius: 4px; background: #5c7e10; color: #fff; font: ${FONTE}; white-space: nowrap; cursor: pointer; opacity: .9; transition: opacity .2s, background .18s, transform .12s cubic-bezier(.2,.8,.2,1); }
.item:hover .sv-acao, .item .sv-acao:focus-visible { opacity: 1; }
.item .sv-acao:hover { background: #79a51a; }
.item .sv-acao:active { transform: scale(.92); }
.item .sv-acao:disabled { background: #3d4450; cursor: default; }
.item .sv-acao:focus-visible { outline: 2px solid #66c0f4; outline-offset: 1px; }
.item .sv-acao-selecionar { left: 4px; top: 4px; right: auto; bottom: auto; width: 20px; height: 20px; padding: 0; border: 2px solid rgba(255,255,255,.75); border-radius: 50%; background: rgba(14,20,27,.55); opacity: 0; }
.item .sv-acao-selecionar:hover { background: rgba(14,20,27,.8); }
.item .sv-acao-selecionar::before { content: ""; position: absolute; left: -8px; top: -8px; width: 36px; height: 36px; border-radius: 50%; }
.item:hover .sv-acao-selecionar, .sv-selecionando .item .sv-acao-selecionar, .item .sv-acao-selecionar[aria-pressed="true"], .item .sv-acao-selecionar:focus-visible { opacity: 1; }
.item .sv-acao-selecionar[aria-pressed="true"] { border-color: #66c0f4; background: #66c0f4; }
.item .sv-acao-selecionar[aria-pressed="true"]::after { content: ""; position: absolute; left: 5px; top: 1px; width: 5px; height: 10px; border: solid #0e141b; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.item.sv-selecionado { outline: 2px solid #66c0f4; outline-offset: -2px; }
@starting-style { .item .sv-preco-item, .item .sv-acao:not(.sv-acao-selecionar), .item .sv-qtd { opacity: 0; } }
@keyframes sv-pulso { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .item .sv-preco-item, .item .sv-acao, .item .sv-qtd { transition: none; animation: none; } }`;

/** Botão de ação dentro do quadrado: "listar" (pelo preço mostrado) e "selecionar" (para listar vários de uma vez). */
export interface AcaoQuadrado {
  acao: "listar" | "selecionar";
  rotulo: string;
  aria: string;
  ocupado?: boolean;
  /** só "selecionar": marcado ou não (aria-pressed) */
  marcado?: boolean;
}
const ACOES = new Set(["listar", "selecionar"]);

/**
 * `itens`: chave `appid_contextid_assetid` (o id do quadrado na Steam) → texto do preço.
 * `acoes`: botões de cada quadrado; quadrado fora do mapa perde os botões. Só mexe no DOM se algo muda.
 */
export function aplicarPrecos(doc: Document, itens: Map<string, string>, acoes: Map<string, AcaoQuadrado[]> = new Map()): void {
  garantirEstilo(doc);
  for (const [chave, texto] of itens) {
    const quadrado = doc.getElementById(chave);
    if (!quadrado) continue;
    const marca = marcaDe(doc, quadrado);
    if (marca.classList.contains("sv-listado")) continue; // item já anunciado: a marca de listado manda
    if (marca.textContent !== texto) marca.textContent = texto;
    const ocupado = texto.endsWith("…"); // "conferindo…", "listando…": pulsa enquanto a Steam responde
    if (marca.classList.contains("sv-ocupado") !== ocupado) marca.classList.toggle("sv-ocupado", ocupado);
    botoes(doc, quadrado, acoes.get(chave) ?? []);
  }
}

function botoes(doc: Document, quadrado: Element, lista: AcaoQuadrado[]): void {
  const atuais = new Map([...quadrado.querySelectorAll<HTMLButtonElement>(":scope > .sv-acao")].map((b) => [b.dataset.svAcao ?? "", b]));
  const querem = new Set(lista.map((a) => a.acao));
  for (const [acao, b] of atuais) if (!querem.has(acao as AcaoQuadrado["acao"])) b.remove();
  const selecionado = lista.some((a) => a.acao === "selecionar" && a.marcado);
  if (quadrado.classList.contains("sv-selecionado") !== selecionado) quadrado.classList.toggle("sv-selecionado", selecionado);
  for (const a of lista) {
    let b = atuais.get(a.acao);
    if (!b) {
      b = doc.createElement("button");
      b.type = "button";
      b.className = `sv-acao sv-acao-${a.acao}`;
      b.dataset.svAcao = a.acao;
      quadrado.append(b);
    }
    if (b.textContent !== a.rotulo) b.textContent = a.rotulo;
    if (b.getAttribute("aria-label") !== a.aria) {
      b.setAttribute("aria-label", a.aria);
      b.title = a.aria;
    }
    if (b.disabled !== Boolean(a.ocupado)) b.disabled = Boolean(a.ocupado);
    if (a.marcado !== undefined && b.getAttribute("aria-pressed") !== String(a.marcado)) b.setAttribute("aria-pressed", String(a.marcado));
  }
}

/** Qual botão de ação recebeu o clique, e de qual quadrado; null fora dos botões. */
export function acaoDoBotao(alvo: EventTarget | null): { id: string; acao: AcaoQuadrado["acao"] } | null {
  const b = alvo instanceof Element ? alvo.closest<HTMLElement>(".sv-acao") : null;
  const acao = b?.dataset.svAcao;
  const id = b ? idDoQuadrado(b) : null;
  return id && acao && ACOES.has(acao) ? { id, acao: acao as AcaoQuadrado["acao"] } : null;
}

/**
 * Itens que já estão à venda: mostra "Listado R$ x" no quadrado e, se `ocultar`, esconde o quadrado inteiro.
 * `itens`: id do quadrado → preço anunciado em centavos (ou null se ilegível).
 */
export function marcarListados(
  doc: Document,
  itens: Map<string, number | null>,
  formatar: (c: number) => string,
  ocultar: boolean,
  /** recém-listados que ainda esperam aprovação no app da Steam */
  pendentes: Set<string> = new Set(),
): void {
  garantirEstilo(doc);
  for (const [chave, preco] of itens) {
    const quadrado = doc.getElementById(chave);
    if (!quadrado) continue;
    const marca = marcaDe(doc, quadrado);
    for (const b of quadrado.querySelectorAll(":scope > .sv-acao")) b.remove();
    if (!marca.classList.contains("sv-listado")) marca.classList.add("sv-listado");
    if (marca.classList.contains("sv-ocupado")) marca.classList.remove("sv-ocupado"); // listado não pulsa
    if (quadrado.classList.contains("sv-selecionado")) quadrado.classList.remove("sv-selecionado");
    const pendente = pendentes.has(chave);
    if (marca.classList.contains("sv-pendente") !== pendente) marca.classList.toggle("sv-pendente", pendente);
    const texto = pendente ? tx().faltaAprovar : preco === null ? tx().listado : tx().listadoPor(formatar(preco));
    if (marca.textContent !== texto) marca.textContent = texto;
    const suporte = quadrado.closest(".itemHolder");
    if (suporte && suporte.classList.contains("sv-oculto") !== ocultar) suporte.classList.toggle("sv-oculto", ocultar);
  }
}

/** Id do quadrado da Steam (`appid_contextid_assetid`) sob o alvo do clique, ou null. */
export function idDoQuadrado(alvo: EventTarget | null): string | null {
  const el = alvo instanceof Element ? alvo.closest(".item") : null;
  return el && /^\d{1,7}_\d{1,3}_\d{1,15}$/.test(el.id) ? el.id : null;
}

function garantirEstilo(doc: Document): void {
  if (doc.getElementById(ID_ESTILO)) return;
  const estilo = doc.createElement("style");
  estilo.id = ID_ESTILO;
  estilo.textContent = CSS;
  doc.head.append(estilo);
}

function marcaDe(doc: Document, quadrado: Element): Element {
  let marca = quadrado.querySelector(":scope > .sv-preco-item");
  if (!marca) {
    marca = doc.createElement("span");
    marca.className = "sv-preco-item";
    quadrado.append(marca);
  }
  return marca;
}

/** Quadrados da página da grade que está na tela (a Steam esconde as outras com display: none). */
export function idsVisiveis(doc: Document): string[] {
  const oculto = (el: Element | null) => (el as HTMLElement | null)?.style.display === "none";
  const ids: string[] = [];
  for (const pag of doc.querySelectorAll("#inventories .inventory_page")) {
    if (oculto(pag) || oculto(pag.closest(".inventory_ctn"))) continue;
    for (const el of pag.querySelectorAll(".item")) {
      if (!el.closest(".sv-agrupado, .sv-oculto") && /^\d{1,7}_\d{1,3}_\d{1,20}$/.test(el.id)) ids.push(el.id);
    }
  }
  return ids;
}

/**
 * Com `ativo`, manda os quadrados listados para as últimas posições da grade (as últimas páginas); sem `ativo`,
 * volta à ordem original. Devolve se mudou algo.
 */
export function ordenarListados(doc: Document, ehListado: (id: string) => boolean, ativo: boolean): boolean {
  return ordenarGrade(doc, (id) => [ativo && ehListado(id) ? 1 : 0]);
}

/**
 * Reordena os quadrados de todas as páginas da grade pela `chave` de cada id (comparada em ordem, menor primeiro;
 * empate fica na ordem original da Steam), mantendo a quantidade de quadrados de cada página e as casas vazias no fim.
 * Chave vazia para todos = ordem original. Só mexe no DOM se a ordem muda; devolve se mudou.
 */
export function ordenarGrade(doc: Document, chave: (id: string) => number[]): boolean {
  let mudou = false;
  const grupos = new Map<Element, Element[]>();
  for (const pagina of doc.querySelectorAll("#inventories .inventory_page")) {
    const pai = pagina.parentElement;
    if (pai) grupos.set(pai, [...(grupos.get(pai) ?? []), pagina]);
  }
  for (const paginas of grupos.values()) {
    const porPagina = paginas.map((p) => [...p.children].filter((c) => c.classList.contains("itemHolder")));
    const atuais = porPagina.flat();
    atuais.forEach((h, i) => {
      if (!h.hasAttribute("data-sv-i")) h.setAttribute("data-sv-i", String(i));
    });
    const chaves = new Map<Element, number[]>();
    for (const h of atuais) {
      const q = h.querySelector(".item");
      chaves.set(h, q ? [0, ...chave(q.id)] : [1]); // casa vazia sempre no fim
    }
    const comparar = (a: Element, b: Element): number => {
      const ka = chaves.get(a)!;
      const kb = chaves.get(b)!;
      for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
        const d = (ka[i] ?? 0) - (kb[i] ?? 0);
        if (d !== 0) return d;
      }
      return Number(a.getAttribute("data-sv-i")) - Number(b.getAttribute("data-sv-i"));
    };
    const ordenados = [...atuais].sort(comparar);
    if (ordenados.every((h, i) => h === atuais[i])) continue;
    mudou = true;
    let k = 0;
    porPagina.forEach((hs, n) => {
      const novos = ordenados.slice(k, k + hs.length);
      k += hs.length;
      const pagina = paginas[n]!;
      const ancora = [...pagina.children].find((c) => !c.classList.contains("itemHolder")) ?? null;
      for (const h of novos) pagina.insertBefore(h, ancora);
    });
  }
  return mudou;
}

/**
 * Agrupar itens iguais: `quantidades` = representante → quantos iguais (marca "xN" se > 1);
 * `copias` = quadrados escondidos. Quem saiu das duas listas volta ao normal. Só mexe no DOM se algo muda.
 */
export function marcarGrupos(doc: Document, quantidades: Map<string, number>, copias: Set<string>): void {
  garantirEstilo(doc);
  for (const el of doc.querySelectorAll(".item .sv-qtd")) {
    const q = el.parentElement;
    if (!q || (quantidades.get(q.id) ?? 0) < 2) el.remove();
  }
  for (const h of doc.querySelectorAll(".itemHolder.sv-agrupado")) {
    const id = h.querySelector(".item")?.id ?? "";
    if (!copias.has(id)) h.classList.remove("sv-agrupado");
  }
  for (const [id, n] of quantidades) {
    if (n < 2) continue;
    const q = doc.getElementById(id);
    if (!q) continue;
    let marca = q.querySelector(":scope > .sv-qtd");
    if (!marca) {
      marca = doc.createElement("span");
      marca.className = "sv-qtd";
      q.append(marca);
    }
    if (marca.textContent !== `x${n}`) marca.textContent = `x${n}`;
  }
  for (const id of copias) {
    const h = doc.getElementById(id)?.closest(".itemHolder");
    if (h && !h.classList.contains("sv-agrupado")) h.classList.add("sv-agrupado");
  }
}

