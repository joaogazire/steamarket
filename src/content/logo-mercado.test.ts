import { describe, expect, it, vi } from "vitest";
import { acharTituloVendas, montarLogoMercado } from "./logo-mercado.ts";

const pagina = (): string => `
<div id="tabContentsMyListings">
  <div class="my_listing_section market_content_block market_home_listing_table">
    <h3 class="my_market_header"><span>My listings awaiting confirmation</span> <span class="my_market_header_count">(<span id="my_market_awaiting_number">10</span>)</span></h3>
    <div class="market_listing_row" id="mylisting_1"></div>
  </div>
  <div class="my_listing_section market_content_block market_home_listing_table">
    <h3 class="my_market_header"><span id="my_market_selllistings_title">My sell listings</span> <span class="my_market_header_count">(<span id="my_market_selllistings_number">195</span>)</span></h3>
    <div class="market_listing_row" id="mylisting_2"></div>
  </div>
</div>`;

describe("acharTituloVendas", () => {
  it("acha o título de 'My sell listings' (não o de aguardando confirmação)", () => {
    document.body.innerHTML = pagina();
    expect(acharTituloVendas(document)?.textContent).toContain("My sell listings");
  });
  it("sem o id do contador: usa o título da última seção com anúncios", () => {
    document.body.innerHTML = pagina().replace(/ id="my_market_selllistings_number"/, "").replace(/ id="my_market_selllistings_title"/, "");
    expect(acharTituloVendas(document)?.textContent).toContain("My sell listings");
  });
  it("sem nada reconhecível → null", () => {
    document.body.innerHTML = "<div>x</div>";
    expect(acharTituloVendas(document)).toBeNull();
  });
});

describe("montarLogoMercado", () => {
  const op = () => ({ atual: () => "pt" as const, aoEscolher: vi.fn(), perfil: () => "paciente" as const, aoEscolherPerfil: vi.fn() });
  it("põe o logo à direita do título e só uma vez", () => {
    document.body.innerHTML = pagina();
    const a = montarLogoMercado(document, op());
    expect(a).not.toBeNull();
    const titulo = acharTituloVendas(document)!;
    expect(titulo.querySelectorAll("#sv-logo-mercado")).toHaveLength(1);
    // título em flex e logo empurrado para a direita, centralizado na linha do texto
    expect(titulo.style.display).toBe("flex");
    expect(titulo.style.alignItems).toBe("center");
    expect((titulo.querySelector("#sv-logo-mercado") as HTMLElement).style.marginLeft).toBe("auto");
    expect(montarLogoMercado(document, op())).toBeNull();
    expect(document.querySelectorAll("#sv-logo-mercado")).toHaveLength(1);
  });
  it("sem título reconhecível não monta nada", () => {
    document.body.innerHTML = "<div>x</div>";
    expect(montarLogoMercado(document, op())).toBeNull();
  });
  it("clicar no logo abre o menu (idioma e perfil)", () => {
    document.body.innerHTML = pagina();
    const a = montarLogoMercado(document, op())!;
    a.logo.click();
    expect(a.logo.getAttribute("aria-expanded")).toBe("true");
  });
});
