/** Content script da página /market: sugere, ao lado de PRICE, o preço do perfil de venda escolhido para cada anúncio ativo. */
import type { Resposta } from "../background/roteador.ts";
import { definirIdioma, idioma, lerIdioma, tx, type Idioma } from "../core/i18n.ts";
import { acharTituloVendas, montarLogoMercado } from "./logo-mercado.ts";
import { relistarAnuncio } from "./relistar.ts";
import { montarTotais, type Totais } from "./totais-mercado.ts";
import { totalAnunciado, totalSugerido } from "../core/totais-anuncios.ts";
import { inventario as inventarioDe, removerAnuncio, vender } from "../steam/cliente.ts";
import type { DadosPreco } from "../background/roteador.ts";
import { mediaUltimasVendas } from "../core/historico.ts";
import { lerPerfil, precoPaciente, type Perfil } from "../core/preco-paciente.ts";
import { menorTotal } from "../core/taxas.ts";
import type { Ponto } from "../core/tipos.ts";
import { lerContexto } from "./contexto.ts";
import { ordenarAnuncios, type Direcao } from "../core/ordem-anuncios.ts";
import { fetchDaPagina } from "./fetch-pagina.ts";
import { criarCarregador } from "./carregador-historicos.ts";
import { criarAnel } from "./anel.ts";
import { paginacaoDaSecao, temMaisPaginas } from "./paginas-anuncios.ts";
import { chaveDoAnuncio, chaveDoCabecalho, colocarLinhas, escreverMedia, escreverSugestao, escreverVariacao, lerAnuncios, lerLinhasTotais, type LinhaLida, marcarCarregando, marcarSeta, mostrarRelistar, textoRelistar, tornarClicaveis, valoresDaLinha, type AnuncioLinha, type ChaveOrdem } from "./mercado.ts";

/** Só carteira BRL (7), como no resto da extensão. */
const MOEDA_SUPORTADA = 7;
const GRUPO = "mercado";

async function principal(): Promise<void> {
  const pagina = (window as unknown as { wrappedJSObject?: Record<string, unknown> }).wrappedJSObject;
  const ctx = pagina ? lerContexto(pagina) : null;
  if (!ctx || ctx.moeda !== MOEDA_SUPORTADA) return;
  const enviar = (m: unknown) => browser.runtime.sendMessage(m) as Promise<Resposta>;

  let perfil: Perfil = lerPerfil(undefined);
  // armazenamento indisponível (janela privada, perfil corrompido): segue com os padrões, como no inventário
  const salvo: Record<string, unknown> = await browser.storage.local.get(["perfil", "idioma", "semTrava"]).catch(() => ({}));
  perfil = lerPerfil(salvo.perfil);
  let semTrava = salvo.semTrava === true;
  definirIdioma(lerIdioma(salvo.idioma, browser.i18n.getUILanguage()));
  const nomePerfil = (): string => ({ rapido: tx().perfilRapido, paciente: tx().perfilPaciente, maximo: tx().perfilMaximo })[perfil];

  /** histórico (ou null: sem histórico / erro) de cada item, pela chave appid:nome */
  const historicos = new Map<string, Ponto[] | null>();
  const chave = (a: AnuncioLinha) => `${a.appid}:${a.nome}`;
  let anuncios: AnuncioLinha[] = [];

  function desenhar(a: AnuncioLinha): void {
    const h = historicos.get(chave(a));
    if (h === undefined) return;
    const s = h ? precoPaciente(h, Date.now(), perfil) : null;
    // o mínimo da Steam vale: abaixo dele a venda é recusada
    const sug = s ? { preco: Math.max(s.preco, menorTotal(ctx!.regra)), base: s.base } : null;
    escreverSugestao(document, a, sug, nomePerfil(), ctx!.regra);
    const media = h ? mediaUltimasVendas(h, Date.now()) : null;
    escreverMedia(document, a, media);
    escreverVariacao(document, a, a.preco, media?.preco ?? null);
    // Relistar só no "My sell listings" (a seção de aguardando confirmação não tem esse caminho)
    // o botão guarda o primeiro callback: relistar recalcula preço e q pelo perfil atual na hora do clique
    if (secaoVendas()?.contains(a.row)) mostrarRelistar(document, a.row, sug?.preco ?? null, (ok) => ok && void relistar(a));
  }

  const secaoVendas = (): Element | null => {
    const t = acharTituloVendas(document);
    return t?.closest(".my_listing_section, .market_home_listing_table, .market_content_block") ?? null;
  };

  const daPaginaR = (window as unknown as { content?: { fetch?: typeof fetch } }).content;
  const fetchR = fetchDaPagina((u, i) => (daPaginaR?.fetch ? daPaginaR.fetch(u, i) : fetch(u, i)));
  let relistando = false;
  /** Remove o anúncio e lista o item de novo pelo preço sugerido (um por vez). */
  async function relistar(a: AnuncioLinha): Promise<void> {
    if (relistando) return;
    const listingId = /^mylisting_(\d{1,25})$/.exec(a.row.id)?.[1];
    // preço recalculado agora, do histórico guardado no content script: nem do DOM (a página pode reescrever data-sug)
    // nem do cache do total (pode ter horas; o botão mostra o cálculo de agora)
    const h = historicos.get(chave(a));
    const s = h ? precoPaciente(h, Date.now(), perfil) : null;
    const preco = s ? Math.max(s.preco, menorTotal(ctx!.regra)) : null;
    const q = s?.q ?? 0.5;
    if (!listingId || preco === null || !Number.isSafeInteger(preco) || preco <= 0) return;
    relistando = true;
    textoRelistar(a.row, "…", true);
    const ctxVenda = { sessionid: ctx!.sessionid, steamid: ctx!.steamid };
    const contextid = a.appid === "753" ? "6" : "2"; // itens da comunidade (753) vivem no contexto 6
    try {
      const r = await relistarAnuncio(
        {
          regra: ctx!.regra,
          travar: !semTrava,
          menorAnuncio: async () => {
            const resp = await enviar({ tipo: "preco", appid: a.appid, nome: a.nome, moeda: ctx!.moeda, pais: ctx!.pais, grupoId: GRUPO });
            if (!resp.ok) throw new Error(resp.mensagem ?? resp.erro ?? tx().erroInterno);
            return (resp.dados as DadosPreco).visao.menorAnuncio;
          },
          remover: (id) => removerAnuncio(fetchR, ctxVenda, id),
          inventario: () => inventarioDe(fetchR, ctx!.steamid, a.appid, contextid),
          vender: (ativo, liquido) => vender(fetchR, ctxVenda, ativo, liquido),
          esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
          anuncio: async (id) => {
            // procura o anúncio em todas as páginas de /market/mylistings; erro de rede/formato aborta o relistar
            let total = Infinity;
            for (let i = 0; i < MAX_PAGINAS && i * 100 < total; i++) {
              const r = await fetchPagina(`/market/mylistings/?start=${i * 100}&count=100`, { credentials: "include" });
              if (!r.ok) throw new Error(`mylistings ${r.status}`);
              const d = (await r.json()) as { success?: unknown; total_count?: unknown; results_html?: unknown };
              if (d.success !== true && d.success !== 1) throw new Error("mylistings sem success");
              total = Number(d.total_count);
              if (!Number.isSafeInteger(total) || total < 0) throw new Error("mylistings sem total_count");
              const html = typeof d.results_html === "string" && d.results_html.length <= 5_000_000 ? d.results_html : "";
              const k = chaveDoAnuncio(new DOMParser().parseFromString(html, "text/html"), id);
              if (k) return k;
            }
            return null;
          },
        },
        { listingId, appid: a.appid, nome: a.nome, preco, fonte: q > 0.5 ? "ajustado" : "steam", meuPreco: a.preco, mediana: h ? (precoPaciente(h, Date.now(), "rapido")?.preco ?? null) : null },
      );
      const b = a.row.querySelector<HTMLElement>(".sv-relistar");
      if (r.ok) {
        textoRelistar(a.row, r.precisaConfirmar ? tx().relistarOkConfirmar : tx().relistarOk, true);
        if (b) b.title = "";
        a.row.style.opacity = ".55"; // o anúncio antigo não existe mais; o novo aparece ao recarregar
      } else {
        textoRelistar(a.row, r.removido ? "!" : null, !!r.removido);
        if (b) b.title = r.motivo;
        const aviso = document.createElement("div");
        aviso.textContent = r.motivo;
        aviso.style.cssText = "color:#e8a33d;font-size:12px;padding:4px 12px;";
        a.row.after(aviso);
        window.setTimeout(() => aviso.remove(), 20_000);
        if (r.removido) a.row.style.opacity = ".55";
      }
    } finally {
      relistando = false;
    }
  }

  /** true quando a Steam respondeu sem sessão ou limitou seguido demais: não insistir */
  let limitou = false;
  let aoProgresso: ((feitos: number, total: number) => void) | null = null;

  /** Pinta as linhas na tela: "…" enquanto carrega, o resultado quando já tem. */
  function pintarPagina(): void {
    anuncios = lerAnuncios(document);
    tornarClicaveis(document);
    if (aoProgresso) {
      const chaves = new Set(anuncios.map(chave));
      aoProgresso([...chaves].filter((c) => historicos.has(c)).length, chaves.size);
    }
    for (const a of anuncios) {
      if (!a.row.querySelector(".sv-merc-cel")) marcarCarregando(document, a, nomePerfil());
      a.row.dataset.svVisto = "1"; // linha já tratada: o observador não recomeça a fila por ela (mesmo sem célula)
      if (historicos.has(chave(a))) desenhar(a);
    }
  }

  // Uma fila só para a tela e para o total de todas as páginas (antes eram duas, que pediam o mesmo item em paralelo).
  const carregador = criarCarregador({
    pedir: (p) => enviar({ tipo: "historico", appid: p.appid, nome: p.nome, grupoId: GRUPO }),
    esperar: (ms) => new Promise((ok) => window.setTimeout(ok, ms)),
    tem: (k) => historicos.has(k),
    chavesDaPagina: () => lerAnuncios(document).map(chave),
    chavesTodas: () => linhasTodas.map((l) => l.chave).filter((k): k is string => k !== null),
    aoCarregar: (k, h) => {
      historicos.set(k, h);
      // só a linha do item que chegou (redesenhar a tela toda a cada item custava O(n²))
      const linhas = lerAnuncios(document);
      for (const a of linhas) if (chave(a) === k) desenhar(a);
      if (aoProgresso) {
        const chaves = new Set(linhas.map(chave));
        aoProgresso([...chaves].filter((c) => historicos.has(c)).length, chaves.size);
      }
      atualizarTotais();
    },
    aoParar: () => {
      // o que falta fica sem sugestão em vez de insistir
      limitou = true;
      for (const a of lerAnuncios(document)) if (!historicos.has(chave(a))) escreverSugestao(document, a, null, nomePerfil(), ctx!.regra);
    },
  });
  const carregar = async (): Promise<void> => {
    pintarPagina(); // linhas novas ganham "…" já, mesmo com a fila andando
    await carregador.rodar();
    pintarPagina();
  };

  // ---- total de todos os anúncios (todas as páginas) ----
  let linhasTodas: LinhaLida[] = [];
  let totais: Totais | null = null;
  /** preço sugerido (já com o mínimo da Steam) de um item pelo histórico; null = sem histórico ou ainda não carregou */
  /** sugerido por item e perfil, calculado uma vez (o total refaz a soma a cada item que chega) */
  const sugeridos = new Map<string, number | null>();
  function sugeridoDe(k: string | null): number | null {
    if (!k) return null;
    const h = historicos.get(k);
    if (h === undefined) return null; // ainda não carregou: não guarda
    const mk = `${perfil}|${k}`;
    const guardado = sugeridos.get(mk);
    if (guardado !== undefined) return guardado;
    const s = h ? precoPaciente(h, Date.now(), perfil) : null;
    const v = s ? Math.max(s.preco, menorTotal(ctx!.regra)) : null;
    sugeridos.set(mk, v);
    return v;
  }
  function atualizarTotais(): void {
    if (!totais || linhasTodas.length === 0) return;
    const chaves = new Set(linhasTodas.map((l) => l.chave).filter((k): k is string => k !== null));
    const feitos = [...chaves].filter((k) => historicos.has(k)).length;
    const sugerido = totalSugerido(linhasTodas.map((l) => ({ sugerido: sugeridoDe(l.chave) })), ctx!.regra);
    totais.atualizar({
      anunciado: totalAnunciado(linhasTodas, ctx!.regra),
      sugerido: sugerido.n > 0 ? sugerido : null,
      progresso: { feitos, total: chaves.size },
    });
  }


  // ---- ordenar por PRICE, LISTED ON ou pela coluna do perfil, em todas as páginas ----
  const daPagina = (window as unknown as { content?: { fetch?: typeof fetch } }).content;
  const fetchPagina = fetchDaPagina((u, i) => (daPagina?.fetch ? daPagina.fetch(u, i) : fetch(u, i)));
  const MAX_PAGINAS = 20;
  const sel = ".market_listing_row[id^='mylisting_']";
  let ordem: { chave: ChaveOrdem; dir: Direcao; secao: Element } | null = null;
  let ocupado = false;

  const secaoDe = (cab: Element): Element | null => cab.closest(".my_listing_section, .market_home_listing_table, .market_content_block") ?? cab.parentElement;
  const ehVendas = (secao: Element): boolean => secaoVendas() === secao;
  const temPaginas = (secao: Element): boolean => temMaisPaginas(document, secao, ehVendas(secao));

  /** Busca as demais páginas em /market/mylistings e devolve as linhas da seção (as que já estão na página são reaproveitadas). */
  async function todasAsLinhas(secao: Element): Promise<HTMLElement[]> {
    const atuais = [...secao.querySelectorAll<HTMLElement>(sel)];
    if (!temPaginas(secao)) return atuais;
    const vistos = new Map(atuais.map((r) => [r.id, r]));
    let total = Infinity;
    for (let i = 0; i < MAX_PAGINAS && i * 100 < total; i++) {
      const r = await fetchPagina(`/market/mylistings/?start=${i * 100}&count=100`, { credentials: "include" });
      if (!r.ok) throw new Error(`mylistings ${r.status}`);
      const d = (await r.json()) as { success?: unknown; total_count?: unknown; results_html?: unknown };
      if (d.success !== true && d.success !== 1) throw new Error("mylistings sem success");
      total = Number(d.total_count);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("mylistings sem total_count");
      const html = typeof d.results_html === "string" && d.results_html.length <= 5_000_000 ? d.results_html : "";
      const docNovo = new DOMParser().parseFromString(html, "text/html");
      for (const novo of docNovo.querySelectorAll<HTMLElement>(sel)) {
        if (vistos.has(novo.id)) continue;
        if (document.getElementById(novo.id)) continue; // já existe em outra seção (ex.: aguardando confirmação)
        vistos.set(novo.id, document.adoptNode(novo));
      }
    }
    return [...vistos.values()];
  }

  const NOME_CHAVE = (c: ChaveOrdem): string => (c === "preco" ? "PRICE" : c === "data" ? "LISTED ON" : nomePerfil());

  function barra(secao: Element, texto: string, voltar: boolean, progresso?: { feitos: number; total: number }): void {
    let b = secao.querySelector<HTMLElement>(".sv-merc-barra");
    if (!b) {
      b = document.createElement("div");
      b.className = "sv-merc-barra";
      b.style.cssText = "padding:6px 12px;font-size:12px;color:#8f98a0;display:flex;gap:12px;align-items:center;";
      secao.querySelector(".market_listing_table_header")?.after(b);
    }
    b.replaceChildren(document.createTextNode(texto));
    if (progresso) {
      const anel = criarAnel(document);
      anel.definir(progresso.feitos, progresso.total);
      b.prepend(anel.el);
    }
    if (voltar) {
      const v = document.createElement("a");
      v.href = "#";
      v.textContent = tx().ordenarVoltar;
      v.style.cssText = "color:#66c0f4;cursor:pointer;";
      v.addEventListener("click", (e) => {
        e.preventDefault();
        location.reload();
      });
      b.append(v);
    }
  }

  function aplicarOrdem(): void {
    if (!ordem) return;
    const { chave: c, dir, secao } = ordem;
    const linhas = [...secao.querySelectorAll<HTMLElement>(sel)];
    const container = linhas[0]?.parentElement;
    if (!container) return;
    const agora = Date.now();
    colocarLinhas(container, ordenarAnuncios(linhas, (r) => valoresDaLinha(r, agora)[c], dir));
    marcarSeta(document, c, dir);
    barra(secao, `${tx().ordenadoPor} ${NOME_CHAVE(c)} ${dir === "asc" ? "▲" : "▼"} · ${linhas.length}`, true);
  }

  async function ordenarPor(c: ChaveOrdem, secao: Element): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    try {
      const dir: Direcao = ordem && ordem.chave === c && ordem.secao === secao && ordem.dir === "asc" ? "desc" : "asc";
      const inicial = [...secao.querySelectorAll<HTMLElement>(sel)];
      const container = inicial[0]?.parentElement;
      if (!container) return;
      if (temPaginas(secao) && !secao.querySelector(".sv-merc-barra[data-completo]")) {
        barra(secao, tx().ordenarCarregando, false);
        try {
          colocarLinhas(container, await todasAsLinhas(secao));
        } catch {
          barra(secao, tx().ordenarFalhou, false);
          return;
        }
        for (const p of paginacaoDaSecao(document, secao, ehVendas(secao))) p.style.display = "none"; // todas as linhas já estão na tabela
        secao.querySelector<HTMLElement>(".sv-merc-barra")?.setAttribute("data-completo", "1");
      }
      if (c === "sugerido") {
        aoProgresso = (feitos, total) => barra(secao, `${tx().ordenarCalculando}…`, false, { feitos, total });
        try {
          for (let i = 0; i < 3; i++) {
            await carregar();
            if (limitou || lerAnuncios(document).every((a) => historicos.has(chave(a)))) break;
          }
        } finally {
          aoProgresso = null;
        }
      }
      ordem = { chave: c, dir, secao };
      aplicarOrdem();
    } finally {
      ocupado = false;
    }
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    const c = chaveDoCabecalho(e.target);
    const cab = e.target instanceof Element ? e.target.closest(".market_listing_table_header") : null;
    const secao = cab ? secaoDe(cab) : null;
    if (c && secao && secao.querySelector(sel)) void ordenarPor(c, secao);
  });

  /** Redesenha as sugestões e a ordem (perfil ou idioma trocado). */
  function redesenhar(): void {
    for (const a of lerAnuncios(document)) desenhar(a);
    if (ordem?.chave === "sugerido") aplicarOrdem(); // a coluna do perfil mudou de valores
  }
  // Logo do steamarket à direita de "My sell listings": menu de idioma e perfil.
  let logoMontado = false;
  const montarLogo = (): void => {
    if (logoMontado) return;
    logoMontado =
      montarLogoMercado(document, {
        atual: idioma,
        aoEscolher: (i: Idioma) => {
          definirIdioma(i);
          browser.storage.local.set({ idioma: i }).catch(() => undefined);
          redesenhar();
        },
        perfil: () => perfil,
        aoEscolherPerfil: (p) => {
          perfil = p;
          browser.storage.local.set({ perfil: p }).catch(() => undefined);
          redesenhar();
        },
      }) !== null || document.getElementById("sv-logo-mercado") !== null;
    if (logoMontado) {
      totais ??= montarTotais(document);
      atualizarTotais();
    }
  };

  /** Lê todos os anúncios (todas as páginas de /market/mylistings) só para somar; erro aqui só deixa os totais de fora. */
  async function carregarLinhasTodas(): Promise<void> {
    try {
      const todas: LinhaLida[] = [];
      let total = Infinity;
      for (let i = 0; i < MAX_PAGINAS && i * 100 < total; i++) {
        const r = await fetchPagina(`/market/mylistings/?start=${i * 100}&count=100`, { credentials: "include" });
        if (!r.ok) return;
        const d = (await r.json()) as { success?: unknown; total_count?: unknown; results_html?: unknown };
        if (d.success !== true && d.success !== 1) return;
        total = Number(d.total_count);
        if (!Number.isSafeInteger(total) || total < 0) return;
        const html = typeof d.results_html === "string" && d.results_html.length <= 5_000_000 ? d.results_html : "";
        todas.push(...lerLinhasTotais(new DOMParser().parseFromString(html, "text/html")));
      }
      linhasTodas = todas;
      atualizarTotais();
      await carregar(); // a fila faz os da tela primeiro e depois os das outras páginas
    } catch {
      /* sem totais */
    }
  }

  montarLogo();
  void carregarLinhasTodas();
  void carregar().then(atualizarTotais);
  // A Steam troca as linhas ao paginar ou remover um anúncio: olha de novo (sem refazer o que já tem).
  let timer: number | undefined;
  new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      montarLogo();
      // depois que a Steam limitou de vez, não recomeça a fila a cada mudança da página
      // só linhas novas (paginação, ordem): uma linha sem célula possível não faz a fila redesenhar sem parar
      if (!limitou && lerAnuncios(document).some((a) => !a.row.dataset.svVisto)) void carregar();
    }, 400);
  }).observe(document.body, { childList: true, subtree: true });

  // Perfil ou idioma trocado no inventário: refaz as sugestões sem pedir de novo.
  browser.storage.onChanged.addListener((m, area) => {
    if (area !== "local") return;
    if ("semTrava" in m) semTrava = m.semTrava?.newValue === true;
    if ("idioma" in m) definirIdioma(lerIdioma(m.idioma?.newValue, browser.i18n.getUILanguage()));
    if ("perfil" in m || "idioma" in m) {
      if ("perfil" in m) perfil = lerPerfil(m.perfil?.newValue);
      redesenhar();
      atualizarTotais();
    }
  });
}

void principal().catch(() => undefined);
