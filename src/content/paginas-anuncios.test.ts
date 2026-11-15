import { describe, expect, it } from "vitest";
import { paginacaoDaSecao, temMaisPaginas } from "./paginas-anuncios.ts";

const linhas = (n: number): string => Array.from({ length: n }, (_, i) => `<div class="market_listing_row" id="mylisting_${i + 1}"></div>`).join("");

// Estrutura real de /market (Chrome logado, 14/11/2026): a paginação fica FORA da tabela, ao lado dela.
const real = (total: number, visiveis: number, links: number): string => `
<div id="myListings"><div id="tabContentsMyListings">
  <div id="tabContentsMyActiveMarketListingsTable" class="market_content_block my_listing_section market_home_listing_table">
    <h3 class="my_market_header"><span id="my_market_selllistings_title">My sell listings</span>
      <span class="my_market_header_count">(<span id="my_market_selllistings_number">${total}</span>)</span></h3>
    <div class="market_listing_table_header"></div>
    <div id="tabContentsMyActiveMarketListingsRows">${linhas(visiveis)}</div>
  </div>
  <div id="tabContentsMyActiveMarketListings_ctn" class="market_paging">
    <div id="tabContentsMyActiveMarketListings_controls" class="market_paging_controls">
      ${Array.from({ length: links }, () => `<span class="market_paging_pagelink">1</span>`).join("")}
    </div>
  </div>
</div></div>`;

const secao = (): Element => document.getElementById("tabContentsMyActiveMarketListingsTable")!;

describe("ordenar por todas as listagens: há mais páginas?", () => {
  it("anúncios ativos com a paginação fora da tabela (página real): sim", () => {
    document.body.innerHTML = real(202, 10, 7);
    expect(temMaisPaginas(document, secao(), true)).toBe(true);
  });
  it("pelo contador do título, mesmo sem os botões de página", () => {
    document.body.innerHTML = real(202, 10, 0);
    expect(temMaisPaginas(document, secao(), true)).toBe(true);
  });
  it("tudo numa página: não", () => {
    document.body.innerHTML = real(8, 8, 0);
    expect(temMaisPaginas(document, secao(), true)).toBe(false);
  });
  it("outra seção (aguardando confirmação) não usa a paginação dos anúncios ativos", () => {
    document.body.innerHTML = real(202, 10, 7);
    expect(temMaisPaginas(document, secao(), false)).toBe(false);
  });
  it("paginação dentro da própria seção continua valendo", () => {
    document.body.innerHTML = `<div class="my_listing_section">${linhas(3)}<div class="market_paging"><span class="market_paging_pagelink"></span><span class="market_paging_pagelink"></span></div></div>`;
    expect(temMaisPaginas(document, document.querySelector(".my_listing_section")!, false)).toBe(true);
  });
});

describe("paginação a esconder depois de juntar tudo", () => {
  it("anúncios ativos: a paginação ao lado da tabela", () => {
    document.body.innerHTML = real(202, 10, 7);
    expect(paginacaoDaSecao(document, secao(), true).map((e) => e.id)).toEqual(["tabContentsMyActiveMarketListings_ctn"]);
  });
  it("outra seção: só a paginação de dentro dela", () => {
    document.body.innerHTML = real(202, 10, 7);
    expect(paginacaoDaSecao(document, secao(), false)).toEqual([]);
  });
});
