import { describe, expect, it } from "vitest";
import { montarTotais, type EstadoTotais } from "./totais-mercado.ts";
import { montarLogoMercado } from "./logo-mercado.ts";

const pagina = (): string => `
<div class="my_listing_section">
  <h3 class="my_market_header"><span id="my_market_selllistings_title">My sell listings</span> <span class="my_market_header_count">(<span id="my_market_selllistings_number">3</span>)</span></h3>
  <div class="market_listing_row" id="mylisting_1"></div>
</div>`;

const estado = (): EstadoTotais => ({ anunciado: { preco: 352700, liquido: 305900, n: 3 }, sugerido: { preco: 400000, liquido: 347800, n: 2, faltam: 1 }, progresso: { feitos: 2, total: 3 } });

describe("total anunciado no título de My sell listings", () => {
  it("fica logo depois do título e do contador, antes do logo do steamarket", () => {
    document.body.innerHTML = pagina();
    montarLogoMercado(document, { atual: () => "pt", aoEscolher: () => undefined, perfil: () => "maximo", aoEscolherPerfil: () => undefined });
    montarTotais(document)!.atualizar(estado());
    const filhos = [...document.querySelector(".my_market_header")!.children];
    const iA = filhos.indexOf(document.querySelector(".sv-tot-anunciado")!);
    expect(iA).toBeGreaterThan(1);
    expect(filhos.indexOf(document.querySelector(".sv-tot-sugerido")!)).toBe(iA + 1);
    expect(filhos.indexOf(document.querySelector("#sv-logo-mercado")!)).toBe(iA + 2);
  });
  it("mostra o total sugerido do steamarket, com o progresso enquanto calcula, e esconde sem sugestão", () => {
    document.body.innerHTML = pagina();
    const t = montarTotais(document)!;
    t.atualizar(estado());
    const s = document.querySelector<HTMLElement>(".sv-tot-sugerido")!;
    expect(s.textContent).toContain("Steamarket");
    expect(s.textContent).toContain("R$ 4.000,00");
    expect(s.textContent).toContain("R$ 3.478,00");
    // progresso pelo anel do inventário, não pelo texto "calculando 2/3"
    expect(s.textContent).not.toContain("calculando");
    const anel = s.querySelector<HTMLElement>(".sv-anel")!;
    expect(anel.hidden).toBe(false);
    expect(anel.title).toBe("2 de 3 itens");
    expect(anel.textContent).toBe("66%");
    t.atualizar({ ...estado(), progresso: { feitos: 3, total: 3 } });
    expect(s.querySelector<HTMLElement>(".sv-anel")?.hidden ?? true).toBe(true);
    t.atualizar({ ...estado(), sugerido: null });
    expect(s.hidden).toBe(true);
  });
  it("o chip do steamarket fica colado no logo (o espaço livre vai antes dele)", () => {
    document.body.innerHTML = pagina();
    montarLogoMercado(document, { atual: () => "pt", aoEscolher: () => undefined, perfil: () => "maximo", aoEscolherPerfil: () => undefined });
    montarTotais(document)!.atualizar(estado());
    expect(document.querySelector<HTMLElement>(".sv-tot-sugerido")!.style.marginLeft).toBe("auto");
    expect(document.querySelector<HTMLElement>("#sv-logo-mercado")!.style.marginLeft).toBe("8px");
  });
  it("mostra o preço total e quanto recebo", () => {
    document.body.innerHTML = pagina();
    montarTotais(document)!.atualizar(estado());
    const a = document.querySelector(".sv-tot-anunciado")!;
    expect(a.textContent).toContain("R$ 3.527,00");
    expect(a.textContent).toContain("R$ 3.059,00");
  });
  it("monta uma vez só; repetir apenas atualiza; sem título não monta", () => {
    document.body.innerHTML = pagina();
    montarTotais(document)!.atualizar(estado());
    montarTotais(document)!.atualizar(estado());
    expect(document.querySelectorAll(".sv-tot-anunciado")).toHaveLength(1);
    document.body.innerHTML = "<div>x</div>";
    expect(montarTotais(document)).toBeNull();
  });
});
