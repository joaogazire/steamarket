/** Preço sugerido em cima do quadrado do item na grade da Steam (só exibe: não captura cliques). */
const ID_ESTILO = "sv-estilo-overlay";
const CSS = `.itemHolder.sv-oculto { display: none !important; }
.item .sv-preco-item.sv-listado { color: #66c0f4; }
.item .sv-preco-item { position: absolute; left: 3px; bottom: 2px; z-index: 5; padding: 0 3px; border-radius: 2px; background: rgba(0,0,0,.72); color: #8fd14f; font: bold 11px/16px Arial, sans-serif; pointer-events: none; }`;

/** `itens`: chave `appid_contextid_assetid` (o id do quadrado na Steam) → texto do preço. */
export function aplicarPrecos(doc: Document, itens: Map<string, string>): void {
  garantirEstilo(doc);
  for (const [chave, texto] of itens) {
    const quadrado = doc.getElementById(chave);
    if (!quadrado) continue;
    const marca = marcaDe(doc, quadrado);
    if (marca.classList.contains("sv-listado")) continue; // item já anunciado: a marca de listado manda
    if (marca.textContent !== texto) marca.textContent = texto;
  }
}

/**
 * Itens que já estão à venda: mostra "Listado R$ x" no quadrado e, se `ocultar`, esconde o quadrado inteiro.
 * `itens`: id do quadrado → preço anunciado em centavos (ou null se ilegível).
 */
export function marcarListados(doc: Document, itens: Map<string, number | null>, formatar: (c: number) => string, ocultar: boolean): void {
  garantirEstilo(doc);
  for (const [chave, preco] of itens) {
    const quadrado = doc.getElementById(chave);
    if (!quadrado) continue;
    const marca = marcaDe(doc, quadrado);
    if (!marca.classList.contains("sv-listado")) marca.classList.add("sv-listado");
    const texto = preco === null ? "Listado" : `Listado ${formatar(preco)}`;
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
    for (const el of pag.querySelectorAll(".item")) if (/^\d{1,7}_\d{1,3}_\d{1,20}$/.test(el.id)) ids.push(el.id);
  }
  return ids;
}

/**
 * Com `ativo`, manda os quadrados listados para as últimas posições da grade (as últimas páginas), mantendo a
 * quantidade de quadrados de cada página; sem `ativo`, volta à ordem original. Só mexe no DOM se a ordem muda.
 */
export function ordenarListados(doc: Document, ehListado: (id: string) => boolean, ativo: boolean): void {
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
    const peso = (h: Element): number => {
      const q = h.querySelector(".item");
      if (!q) return 2; // casa vazia sempre no fim
      return ativo && ehListado(q.id) ? 1 : 0;
    };
    const original = (h: Element) => Number(h.getAttribute("data-sv-i"));
    const ordenados = [...atuais].sort((a, b) => peso(a) - peso(b) || original(a) - original(b));
    if (ordenados.every((h, i) => h === atuais[i])) continue;
    let k = 0;
    porPagina.forEach((hs, n) => {
      const novos = ordenados.slice(k, k + hs.length);
      k += hs.length;
      const pagina = paginas[n]!;
      const ancora = [...pagina.children].find((c) => !c.classList.contains("itemHolder")) ?? null;
      for (const h of novos) pagina.insertBefore(h, ancora);
    });
  }
}
