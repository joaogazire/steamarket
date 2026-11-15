/**
 * Paginação de "My sell listings". Na página real a paginação da Steam (#tabContentsMyActiveMarketListings_ctn) fica FORA
 * da tabela dos anúncios, ao lado dela; procurar só dentro da seção fazia a ordem pegar apenas a página atual.
 */
const PAGINACAO_ATIVOS = "tabContentsMyActiveMarketListings_ctn";
const LINHA = ".market_listing_row[id^='mylisting_']";

/** Total de anúncios do título "My sell listings (N)"; null se não achar. */
function totalDoTitulo(doc: Document): number | null {
  const t = doc.getElementById("my_market_selllistings_number")?.textContent?.replace(/\D/g, "") ?? "";
  const n = t ? Number(t) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

/** A seção tem anúncios em outras páginas? `ehVendas`: é a seção dos anúncios ativos (a dos 202), não a de confirmação. */
export function temMaisPaginas(doc: Document, secao: Element, ehVendas: boolean): boolean {
  if (secao.querySelectorAll(".market_paging_pagelink").length > 1) return true;
  if (!ehVendas) return false;
  const total = totalDoTitulo(doc);
  if (total !== null && total > secao.querySelectorAll(LINHA).length) return true;
  return (doc.getElementById(PAGINACAO_ATIVOS)?.querySelectorAll(".market_paging_pagelink").length ?? 0) > 1;
}

/** Paginação a esconder quando todas as linhas já estão na tabela. */
export function paginacaoDaSecao(doc: Document, secao: Element, ehVendas: boolean): HTMLElement[] {
  const dentro = [...secao.querySelectorAll<HTMLElement>(".market_paging")];
  const fora = ehVendas ? doc.getElementById(PAGINACAO_ATIVOS) : null;
  return fora && !dentro.includes(fora) ? [...dentro, fora] : dentro;
}
