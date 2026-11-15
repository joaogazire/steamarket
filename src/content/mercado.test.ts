import { afterEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "../core/i18n.ts";
import { REGRA_PADRAO } from "../core/tipos.ts";
import { lerAnuncios, escreverSugestao, marcarCarregando, chaveDoCabecalho, marcarSeta, colocarLinhas, valoresDaLinha, mostrarRelistar, textoRelistar, escreverMedia, escreverVariacao, lerLinhasTotais } from "./mercado.ts";

afterEach(() => definirIdioma("pt"));

const linha = (id: string, nome: string, appid: string, preco: string, comLink = true): string => `
<div class="market_listing_row market_recent_listing_row listing_${id}" id="mylisting_${id}">
  <div class="market_listing_right_cell market_listing_edit_buttons actual_content"><a>Remove</a></div>
  <div class="market_listing_right_cell market_listing_my_price">
    <span class="market_table_value"><span class="market_listing_price"><span style="display: inline-block">
      <span title="This is the price the buyer pays.">${preco}</span><br>
      <span title="This is how much you will receive." style="color: #AFAFAF">(R$ 0,06)</span>
    </span></span></span>
  </div>
  <div class="market_listing_right_cell market_listing_listed_date can_combine">4 Aug</div>
  <div class="market_listing_item_name_block">
    <span id="mylisting_${id}_name" class="market_listing_item_name">${
      comLink ? `<a class="market_listing_item_name_link" href="https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(nome)}">${nome}</a>` : nome
    }</span><br><span class="market_listing_game_name">Counter-Strike 2</span>
  </div>
</div>`;

const pagina = (): string => `
<div class="market_content_block my_listing_section market_home_listing_table">
  <div class="market_listing_table_header">
    <span class="market_listing_right_cell market_listing_edit_buttons"></span>
    <span class="market_listing_right_cell market_listing_my_price">PRICE</span>
    <span class="market_listing_right_cell market_listing_listed_date">LISTED ON</span>
    <span class="market_listing_item_name_block">NAME</span>
  </div>
  ${linha("1", "Sticker | Snappi | Paris 2023", "730", "R$ 0,27")}
  ${linha("2", "The Heavy", "753", "R$ 1.234,50")}
  ${linha("3", "Sem Link", "730", "R$ 5,00", false)}
</div>`;

describe("lerAnuncios", () => {
  it("lê appid, nome e preço (centavos) de cada anúncio com link do item", () => {
    document.body.innerHTML = pagina();
    const a = lerAnuncios(document);
    expect(a.map((x) => [x.appid, x.nome, x.preco])).toEqual([
      ["730", "Sticker | Snappi | Paris 2023", 27],
      ["753", "The Heavy", 123450],
    ]);
  });
  it("ignora linhas sem link (sem como saber o item)", () => {
    document.body.innerHTML = pagina();
    expect(lerAnuncios(document).some((x) => x.nome === "Sem Link")).toBe(false);
  });
  it("não usa href de outro lugar (só /market/listings/<appid>/<nome> do próprio site)", () => {
    document.body.innerHTML = pagina().replace(/https:\/\/steamcommunity.com\/market\/listings\/730\//, "https://evil.example/market/listings/730/");
    expect(lerAnuncios(document).map((x) => x.nome)).toEqual(["The Heavy"]);
  });
});

describe("coluna de sugestão", () => {
  const montar = () => {
    document.body.innerHTML = pagina();
    return lerAnuncios(document);
  };
  it("cria o cabeçalho com o nome do perfil, à direita de PRICE", () => {
    const [a] = montar();
    marcarCarregando(document, a!, "Máximo");
    const cab = document.querySelector(".market_listing_table_header .sv-merc-cab")!;
    expect(cab.textContent).toBe("Máximo");
    // float:right → quem vem antes no DOM fica mais à direita
    const header = document.querySelector(".market_listing_table_header")!;
    const filhos = [...header.children];
    expect(filhos.indexOf(cab)).toBeLessThan(filhos.indexOf(header.querySelector(".market_listing_my_price")!));
  });
  it("célula da linha: antes da célula PRICE no DOM; mostra … enquanto carrega", () => {
    const [a] = montar();
    marcarCarregando(document, a!, "Máximo");
    const cel = document.querySelector("#mylisting_1 .sv-merc-cel")!;
    expect(cel.textContent).toBe("…");
    const filhos = [...document.querySelector("#mylisting_1")!.children];
    expect(filhos.indexOf(cel)).toBeLessThan(filhos.indexOf(document.querySelector("#mylisting_1 .market_listing_my_price")!));
  });
  it("sugestão acima do atual: mostra preço, líquido e marca 'sobe' (verde)", () => {
    const [a] = montar();
    escreverSugestao(document, a!, { preco: 50, base: "percentil 90 de 800 vendas em 6 meses" }, "Máximo", REGRA_PADRAO);
    const cel = document.querySelector<HTMLElement>("#mylisting_1 .sv-merc-cel")!;
    expect(cel.textContent).toContain("R$ 0,50");
    expect(cel.textContent).toContain("(R$ 0,");
    expect(cel.dataset.estado).toBe("sobe");
    expect(cel.title).toContain("percentil 90");
  });
  it("sugestão abaixo do atual: 'desce'; perto (±3%): 'ok'", () => {
    const [a, b] = montar();
    escreverSugestao(document, a!, { preco: 20, base: "x" }, "Máximo", REGRA_PADRAO);
    expect(document.querySelector<HTMLElement>("#mylisting_1 .sv-merc-cel")!.dataset.estado).toBe("desce");
    escreverSugestao(document, b!, { preco: 123450, base: "x" }, "Máximo", REGRA_PADRAO);
    expect(document.querySelector<HTMLElement>("#mylisting_2 .sv-merc-cel")!.dataset.estado).toBe("ok");
  });
  it("sem sugestão (sem histórico): traço e dica; chamar de novo troca o conteúdo, sem duplicar a célula", () => {
    const [a] = montar();
    escreverSugestao(document, a!, null, "Máximo", REGRA_PADRAO);
    expect(document.querySelector("#mylisting_1 .sv-merc-cel")!.textContent).toBe("—");
    escreverSugestao(document, a!, { preco: 50, base: "x" }, "Máximo", REGRA_PADRAO);
    expect(document.querySelectorAll("#mylisting_1 .sv-merc-cel")).toHaveLength(1);
    expect(document.querySelectorAll(".sv-merc-cab")).toHaveLength(1);
  });
  it("textos no texto do usuário entram como texto, nunca como HTML", () => {
    const [a] = montar();
    escreverSugestao(document, a!, { preco: 50, base: "<img src=x onerror=alert(1)>" }, "<b>M</b>", REGRA_PADRAO);
    expect(document.querySelector("#mylisting_1 .sv-merc-cel img")).toBeNull();
    expect(document.querySelector(".sv-merc-cab b")).toBeNull();
  });
});

describe("ordenar pelo cabeçalho", () => {
  const AGORA = Date.UTC(2026, 10, 14, 12);
  it("chaveDoCabecalho: PRICE, LISTED ON e a coluna do perfil são clicáveis; NAME e as linhas não", () => {
    document.body.innerHTML = pagina();
    const [a] = lerAnuncios(document);
    marcarCarregando(document, a!, "Máximo");
    const h = (sel: string) => document.querySelector(`.market_listing_table_header ${sel}`)!;
    expect(chaveDoCabecalho(h(".market_listing_my_price"))).toBe("preco");
    expect(chaveDoCabecalho(h(".market_listing_listed_date"))).toBe("data");
    expect(chaveDoCabecalho(h(".sv-merc-cab"))).toBe("sugerido");
    expect(chaveDoCabecalho(h(".market_listing_item_name_block"))).toBeNull();
    expect(chaveDoCabecalho(document.querySelector("#mylisting_1 .market_listing_my_price"))).toBeNull();
    expect(chaveDoCabecalho(null)).toBeNull();
  });
  it("valoresDaLinha: preço, data da listagem e sugestão", () => {
    document.body.innerHTML = pagina();
    const [a] = lerAnuncios(document);
    escreverSugestao(document, a!, { preco: 50, base: "x" }, "Máximo", REGRA_PADRAO);
    expect(valoresDaLinha(a!.row, AGORA)).toEqual({ preco: 27, data: Date.UTC(2026, 7, 4), sugerido: 50 });
  });
  it("marcarSeta: só um cabeçalho com seta; null tira todas", () => {
    document.body.innerHTML = pagina();
    const [a] = lerAnuncios(document);
    marcarCarregando(document, a!, "Máximo");
    marcarSeta(document, "preco", "asc");
    marcarSeta(document, "data", "desc");
    const setas = [...document.querySelectorAll(".sv-seta")].map((e) => e.textContent);
    expect(setas).toEqual(["▼"]);
    marcarSeta(document, null, "asc");
    expect(document.querySelectorAll(".sv-seta")).toHaveLength(0);
  });
  it("colocarLinhas: põe as linhas na ordem dada, mantém o que não é linha, e traz linhas de fora", () => {
    document.body.innerHTML = `<div id="c"><div class="market_listing_row" id="mylisting_1">1</div><div class="market_listing_row" id="mylisting_2">2</div><div class="fim">fim</div></div>`;
    const c = document.querySelector<HTMLElement>("#c")!;
    const novo = document.createElement("div");
    novo.className = "market_listing_row";
    novo.id = "mylisting_3";
    colocarLinhas(c, [novo, document.querySelector<HTMLElement>("#mylisting_2")!, document.querySelector<HTMLElement>("#mylisting_1")!]);
    expect([...c.children].map((e) => e.id || e.className)).toEqual(["mylisting_3", "mylisting_2", "mylisting_1", "fim"]);
  });
});

describe("botão Relistar (ao lado de Remove)", () => {
  const cel = (row: HTMLElement) => row.querySelector<HTMLElement>(".market_listing_edit_buttons")!;
  it("entra na célula do Remove, uma vez só, com o preço na dica; clique chama o callback", () => {
    document.body.innerHTML = pagina();
    const row = document.querySelector<HTMLElement>("#mylisting_1")!;
    const cb = vi.fn();
    mostrarRelistar(document, row, 50, cb);
    mostrarRelistar(document, row, 55, cb);
    const bs = row.querySelectorAll<HTMLElement>(".market_listing_edit_buttons .sv-relistar");
    expect(bs).toHaveLength(1);
    expect(bs[0]!.title).toContain("R$ 0,55");
    expect(bs[0]!.hidden).toBe(false);
    expect(bs[0]!.dataset.rotulo).toBe("Relistar");
    expect(cel(row).style.position).toBe("relative"); // âncora do posicionamento ao lado do Remove
    expect(bs[0]!.style.position).toBe("absolute"); // não empilha em cima do Remove
    expect(bs[0]!.className).not.toContain("item_market_action_button"); // CSS da Steam não pode herdar
  });
  it("sem sugestão: o botão fica escondido", () => {
    document.body.innerHTML = pagina();
    const row = document.querySelector<HTMLElement>("#mylisting_1")!;
    mostrarRelistar(document, row, null, vi.fn());
    expect(row.querySelector<HTMLElement>(".sv-relistar")!.hidden).toBe(true);
  });
  it("textoRelistar troca o rótulo e trava o botão durante o trabalho", () => {
    document.body.innerHTML = pagina();
    const row = document.querySelector<HTMLElement>("#mylisting_1")!;
    mostrarRelistar(document, row, 50, vi.fn());
    textoRelistar(row, "…", true);
    const b = row.querySelector<HTMLElement>(".sv-relistar")!;
    expect(b.dataset.rotulo).toBe("…");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    textoRelistar(row, null, false);
    expect(b.dataset.rotulo).toBe("Relistar");
    expect(b.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("coluna da média das últimas vendas", () => {
  it("ordem na tela: PRICE, últimas vendas, %, perfil (no DOM é o inverso, por causa do float) — qualquer ordem de criação", () => {
    const ordemDom = (pai: Element, classes: string[]) => classes.map((c) => [...pai.children].findIndex((x) => x.classList.contains(c)));
    for (const ordemCriacao of [["perfil", "pct", "med"], ["med", "pct", "perfil"], ["pct", "perfil", "med"]]) {
      document.body.innerHTML = pagina();
      const [a] = lerAnuncios(document);
      for (const c of ordemCriacao) {
        if (c === "med") escreverMedia(document, a!, { preco: 41, amostra: 5 });
        if (c === "pct") escreverVariacao(document, a!, 27, 41);
        if (c === "perfil") escreverSugestao(document, a!, { preco: 50, base: "x" }, "Máximo", REGRA_PADRAO);
      }
      const linha = ordemDom(document.querySelector("#mylisting_1")!, ["sv-merc-cel", "sv-merc-pct", "sv-merc-med", "market_listing_my_price"]);
      expect(linha.every((i) => i >= 0), ordemCriacao.join()).toBe(true);
      expect([...linha].sort((x, y) => x - y)).toEqual(linha);
      const cab = ordemDom(document.querySelector(".market_listing_table_header")!, ["sv-merc-cab", "sv-merc-cab-pct", "sv-merc-cab-med", "market_listing_my_price"]);
      expect(cab.every((i) => i >= 0), ordemCriacao.join()).toBe(true);
      expect([...cab].sort((x, y) => x - y)).toEqual(cab);
    }
  });
  it("mostra o preço e a quantidade de vendas; sem vendas no dia, traço; sem duplicar", () => {
    document.body.innerHTML = pagina();
    const [a] = lerAnuncios(document);
    escreverMedia(document, a!, { preco: 41, amostra: 3 });
    const cel = document.querySelector<HTMLElement>("#mylisting_1 .sv-merc-med")!;
    expect(cel.firstElementChild!.textContent).toBe("R$ 0,41");
    expect(cel.textContent).toContain("3 vendas");
    expect(cel.title).toContain("3");
    escreverMedia(document, a!, null);
    expect(cel.textContent).toBe("—");
    expect(document.querySelectorAll("#mylisting_1 .sv-merc-med")).toHaveLength(1);
    expect(document.querySelectorAll(".sv-merc-cab-med")).toHaveLength(1);
  });
});

describe("coluna % (variação do PRICE para as últimas vendas)", () => {
  it("mostra a variação com sinal; verde se as vendas estão acima do anunciado, âmbar se abaixo, cinza se perto", () => {
    document.body.innerHTML = pagina();
    const [a] = lerAnuncios(document);
    const cel = () => document.querySelector<HTMLElement>("#mylisting_1 .sv-merc-pct")!;
    escreverVariacao(document, a!, 27, 41); // +51,85%
    expect(cel().textContent).toBe("+52%");
    expect(cel().dataset.estado).toBe("sobe");
    escreverVariacao(document, a!, 27, 17);
    expect(cel().textContent).toBe("−37%");
    expect(cel().dataset.estado).toBe("desce");
    escreverVariacao(document, a!, 100, 101);
    expect(cel().dataset.estado).toBe("ok");
    expect(cel().textContent).toBe("+1,0%");
  });
  it("sem dados: traço; cabeçalho '%' criado uma vez, com dica", () => {
    document.body.innerHTML = pagina();
    const [a] = lerAnuncios(document);
    escreverVariacao(document, a!, 27, null);
    expect(document.querySelector("#mylisting_1 .sv-merc-pct")!.textContent).toBe("—");
    escreverVariacao(document, a!, 27, 30);
    expect(document.querySelectorAll(".sv-merc-cab-pct")).toHaveLength(1);
    expect(document.querySelector(".sv-merc-cab-pct")!.textContent).toBe("%");
    expect((document.querySelector(".sv-merc-cab-pct") as HTMLElement).title).not.toBe("");
  });
});

describe("lerLinhasTotais (para somar todos os anúncios)", () => {
  it("lê preço, líquido (a segunda linha do PRICE) e a chave do item; linha sem link entra com chave null", () => {
    document.body.innerHTML = pagina();
    const l = lerLinhasTotais(document);
    expect(l.map((x) => [x.chave, x.preco, x.liquido])).toEqual([
      ["730:Sticker | Snappi | Paris 2023", 27, 6],
      ["753:The Heavy", 123450, 6],
      [null, 500, 6],
    ]);
  });
  it("funciona em um documento solto (HTML de outras páginas da Steam)", () => {
    const outro = new DOMParser().parseFromString(pagina(), "text/html");
    expect(lerLinhasTotais(outro)).toHaveLength(3);
  });
});

describe("chaveDoAnuncio (relistar confere o anúncio em /market/mylistings)", () => {
  it("acha appid:nome pelo id da linha; id ausente = null", async () => {
    const { chaveDoAnuncio } = await import("./mercado.ts");
    const doc = new DOMParser().parseFromString(linha("77", "AWP | X (Field-Tested)", "730", "R$ 1,00") + linha("78", "Outro", "730", "R$ 1,00"), "text/html");
    expect(chaveDoAnuncio(doc, "77")).toBe("730:AWP | X (Field-Tested)");
    expect(chaveDoAnuncio(doc, "79")).toBeNull();
  });
  it("id fora do formato não vira seletor", async () => {
    const { chaveDoAnuncio } = await import("./mercado.ts");
    const doc = new DOMParser().parseFromString(linha("77", "X", "730", "R$ 1,00"), "text/html");
    expect(chaveDoAnuncio(doc, "77'],*")).toBeNull();
  });
});
