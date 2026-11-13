/** Ponto de entrada do content script: preço sugerido em cada quadrado do inventário e venda com um clique. */
import type { Resposta } from "../background/roteador.ts";
import { agrupar } from "../core/agrupar.ts";
import { motivoParaNaoListar, type FontePreco } from "../core/sugestao.ts";
import { liquido as liquidoDe, menorTotal } from "../core/taxas.ts";
import { reais, somarTotal } from "../core/total.ts";
import { definirIdioma, idioma, lerIdioma, tx, type Idioma } from "../core/i18n.ts";
import { montarMenuAjustes } from "./ajustes.ts";
import { naoCompensa, taxaEfetiva } from "../core/compensa.ts";
import { lerPerfil, precoPaciente, type Perfil } from "../core/preco-paciente.ts";
import { avaliarMomento, descreverMotivos, type Veredito } from "../core/momento-venda.ts";

declare const __BUILD__: string | undefined;
import type { Ativo, Grupo, Ponto } from "../core/tipos.ts";
import { lerOrdem, renderControles, type OpcoesPainel, type Ordem } from "./controles.ts";
import { lerAppDaPagina, lerContexto } from "./contexto.ts";
import cssPainel from "./estilo.css";
import { esperarInventarioDaPagina } from "./inventario-pagina.ts";
import { acaoDoBotao, aplicarPrecos, idsVisiveis, marcarBaratos, marcarBons, marcarGrupos, marcarListados, ordenarGrade, type AcaoQuadrado } from "./overlay.ts";
import { montarPainel, posicionar } from "./painel.ts";
import { chaveDeOrdem as chaveOrdem, fotografarPrecos, proximoParaRefinar } from "./ordem.ts";
import { criarTodasPaginas, recarregarImagens } from "./paginas-steam.ts";
import { tratarPorta } from "./porta.ts";
import type { DadosPreco } from "../background/roteador.ts";
import { ErroSessao, vender } from "../steam/cliente.ts";
import { ErroLimite } from "../background/fila.ts";
import { fetchDaPagina } from "./fetch-pagina.ts";

/** A formatação de preços é em reais; outras moedas não vendem até serem suportadas (BRL = 7 na Steam). */
const MOEDA_SUPORTADA = 7;

async function principal(): Promise<void> {
  // Firefox: as variáveis globais da página ficam em wrappedJSObject.
  const pagina = (window as unknown as { wrappedJSObject?: Record<string, unknown> }).wrappedJSObject;
  const ctx = pagina ? lerContexto(pagina) : null;
  if (!ctx) return;

  const enviar = (m: unknown) => browser.runtime.sendMessage(m) as Promise<Resposta>;
  const painel = montarPainel(document, ctx, (m) => void enviar(m));
  if (!painel) return;

  const estilo = document.createElement("style");
  estilo.textContent = cssPainel;
  painel.raiz.append(estilo);
  // Na coluna da caixa de detalhes, ao lado do logo do jogo; refaz quando a página muda de tamanho.
  const alinhar = () => posicionar(painel.el, document);
  alinhar();
  window.addEventListener("resize", alinhar);
  document.querySelector("#inventory_applogo")?.addEventListener("load", alinhar);

  const progressos = new Map<string, (k: number, n: number) => void>();
  const porta = browser.runtime.connect({ name: "painel" });
  porta.onMessage.addListener((m) =>
    tratarPorta(m, { avisar: (t) => painel.avisar(t), progresso: (id, k, n) => progressos.get(id)?.(k, n) }),
  );

  /** Erro vindo do background no idioma escolhido (detalhes técnicos de formato ficam como vieram). */
  const mensagemDe = (r: { erro?: string; mensagem?: string }): string =>
    r.erro === "sessao" ? tx().erroSessao
    : r.erro === "limite" ? tx().erroLimite
    : r.erro === "rede" ? tx().erroRede
    : r.erro === "interno" ? tx().erroInterno
    : (r.mensagem ?? tx().erroInterno);
  const formatar = reais; // um formato só (com milhar) na grade, nos avisos e no total
  // A última ordem, o "agrupar" e o filtro de Not Marketable ficam salvos (valem ao recarregar ou voltar à página).
  let ordemSalva: Ordem = "steam";
  let agruparSalvo = false;
  let naoVendaveisSalvo = false;
  let apenasBonsSalvo = false;
  let baratosSalvo = false;
  let perfil: Perfil = lerPerfil(undefined);
  try {
    const salvo = await browser.storage.local.get(["ordem", "agrupar", "ocultarNaoVendaveis", "apenasBons", "ocultarBaratos", "idioma", "perfil"]);
    definirIdioma(lerIdioma(salvo.idioma, browser.i18n.getUILanguage()));
    ordemSalva = lerOrdem(salvo.ordem);
    agruparSalvo = salvo.agrupar === true;
    naoVendaveisSalvo = salvo.ocultarNaoVendaveis === true;
    apenasBonsSalvo = salvo.apenasBons === true;
    baratosSalvo = salvo.ocultarBaratos === true;
    perfil = lerPerfil(salvo.perfil);
  } catch {
    /* sem storage: começa no padrão */
  }
  let opcoes: OpcoesPainel = { ocultarListados: true, ocultarNaoVendaveis: naoVendaveisSalvo, ordem: ordemSalva, agrupar: agruparSalvo, apenasBons: apenasBonsSalvo, ocultarBaratos: baratosSalvo };
  painel.atualizarTextos();
  const criarControles = () => renderControles(
    painel.conteudo,
    {
      aoListarSelecionados: () => void listarSelecionados(),
      aoMudar: (o) => {
        if (o.ordem !== opcoes.ordem || o.agrupar !== opcoes.agrupar || o.ocultarNaoVendaveis !== opcoes.ocultarNaoVendaveis || o.apenasBons !== opcoes.apenasBons || o.ocultarBaratos !== opcoes.ocultarBaratos) {
          browser.storage.local
            .set({ ordem: o.ordem, agrupar: o.agrupar, ocultarNaoVendaveis: o.ocultarNaoVendaveis, apenasBons: o.apenasBons, ocultarBaratos: o.ocultarBaratos })
            .catch(() => undefined);
        }
        opcoes = o;
        congelarOrdem();
        reaplicar();
      },
    },
    opcoes,
    { resumo: painel.resumo },
  );
  let controles = criarControles();

  // Idioma: escolhido no menu do logo ou na página de configurações; troca tudo sem recarregar.
  const aplicarIdioma = (i: Idioma) => {
    if (i === idioma()) return;
    definirIdioma(i);
    controles = criarControles();
    painel.atualizarTextos();
    reaplicar();
  };
  const menu = montarMenuAjustes(painel.logo, painel.raiz, {
    atual: idioma,
    aoEscolher: (i) => {
      aplicarIdioma(i);
      browser.storage.local.set({ idioma: i }).catch(() => undefined);
    },
    perfil: () => perfil,
    aoEscolherPerfil: (p) => {
      perfil = p;
      browser.storage.local.set({ perfil: p }).catch(() => undefined);
      repreciar();
    },
    rodape: typeof __BUILD__ === "string" ? `steamarket · build ${__BUILD__}` : "steamarket",
  });
  browser.storage.onChanged.addListener((m, area) => {
    if (area === "local" && "idioma" in m) aplicarIdioma(lerIdioma(m.idioma?.newValue, browser.i18n.getUILanguage()));
  });
  // Fecha o menu ao clicar fora dele (na página ou no resto do painel).
  document.addEventListener("click", (e) => {
    if (!e.composedPath().includes(painel.el)) menu.fechar();
  });
  painel.raiz.addEventListener("click", (e) => {
    const caminho = e.composedPath();
    if (!caminho.includes(painel.logo) && !caminho.some((n) => n instanceof HTMLElement && n.classList.contains("sv-menu"))) menu.fechar();
  });

  /** id do quadrado na Steam (appid_contextid_assetid) → texto do preço sugerido exibido por cima dele */
  const precosGrade = new Map<string, string>();
  /** quadrados de itens já anunciados → preço anunciado (centavos) */
  const listados = new Map<string, number | null>();
  /** recém-listados nesta visita que esperam aprovação no celular: ficam no mesmo lugar da grade */
  const aguardando = new Set<string>();
  /** quadrado → item e preço sugerido (centavos); o clique no quadrado lista esse item */
  const porQuadrado = new Map<string, { grupo: Grupo; ativo: Ativo; preco: number | null; fonte: FontePreco }>();
  const emVenda = new Set<string>();
  /** uma venda por vez, com folga entre elas (mesmo ritmo da fila: 3 s) */
  let vendendo = false;
  let ultimaVenda = 0;
  const FOLGA_VENDA_MS = 3000;
  // A venda sai de dentro da página (origem e Referer da Steam); do background ela volta 400.
  const daPagina = (window as unknown as { content?: { fetch?: typeof fetch } }).content;
  const fetchVenda = fetchDaPagina((u, i) => (daPagina?.fetch ? daPagina.fetch(u, i) : fetch(u, i)));
  let timerAviso: ReturnType<typeof setTimeout> | undefined;

  let inventarioCompleto = false;
  /** inventário e nº de páginas em que criarTodasPaginas já rodou */
  let paginasDe: unknown = null;
  let paginasN = -1;

  /** Listados = itens que a página marca como "On Market" (+ mylistings, que traz o preço anunciado). */
  function reaplicar(): void {
    posicionar(painel!.el, document);
    // A Steam cria as páginas da grade sob demanda; para mandar os listados ao fim, todas precisam existir.
    const inv = pagina!.g_ActiveInventory;
    const mexeNaGrade = opcoes.ocultarListados || opcoes.ocultarNaoVendaveis || opcoes.ordem !== "steam" || opcoes.agrupar || opcoes.apenasBons || opcoes.ocultarBaratos;
    if (mexeNaGrade && inventarioCompleto) {
      // uma vez por inventário (ou quando a Steam muda o número de páginas), não a cada reaplicar
      const nPaginas = (inv as { m_rgPages?: unknown[] } | undefined)?.m_rgPages?.length ?? -1;
      if (inv !== paginasDe || nPaginas !== paginasN) {
        criarTodasPaginas(inv);
        paginasDe = inv;
        paginasN = nPaginas;
      }
    }
    agruparIguais();
    aplicarPrecos(document, precosGrade, acoesDosQuadrados());
    const nSel = selecionaveis().length;
    document.documentElement.classList.toggle("sv-selecionando", nSel > 0);
    controles.selecao(nSel, lote ? { feitos: lote.feitos, total: lote.total } : undefined);
    marcarListados(document, listados, formatar, false, aguardando);
    const av = avaliarGrade(); // uma vez por reaplicar (a chave de ordem consulta por item)
    bonsAtuais = av.bons;
    baratosAtuais = av.baratos;
    pendentesAtuais = pendentesDeAnalise();
    marcarBons(document, av.bons, opcoes.apenasBons, av.outras, pendentesAtuais);
    marcarBaratos(document, av.baratos);
    mostrarTotal();
    if (ordenarGrade(document, chaveDeOrdem)) {
      suavizarGrade();
      recarregarImagens(inv); // itens que mudaram de página precisam da imagem
      void refinarVisiveis(); // e do preço da Steam, se agora estão na tela
    }
  }

  /** nome do item → veredito "bom momento para vender" (só os bons); calculado do histórico que já foi baixado */
  const bonsPorNome = new Map<string, Veredito>();
  let bonsAtuais = new Map<string, string>();
  let baratosAtuais = new Set<string>();
  let pendentesAtuais = new Set<string>();
  /** quadrados cujo histórico ainda não chegou: o filtro "só bons" não os esconde antes de analisar */
  const pendentesDeAnalise = (): Set<string> =>
    new Set([...porQuadrado].filter(([id, q]) => !listados.has(id) && !concluidos.has(q.grupo.nome)).map(([id]) => id));
  /**
   * Avaliação de cada quadrado ainda não listado e com preço: dica com o que recebe e a taxa; "barato" (taxa alta,
   * preço abaixo do limite, só em BRL) e "bom negócio" (borda dourada; item que não compensa nunca é bom).
   */
  function avaliarGrade(): { bons: Map<string, string>; baratos: Set<string>; outras: Map<string, string> } {
    const bons = new Map<string, string>();
    const baratos = new Set<string>();
    const outras = new Map<string, string>();
    for (const [id, q] of porQuadrado) {
      if (listados.has(id) || q.preco === null) continue;
      let linha = "";
      try {
        linha = tx().recebeTaxa(formatar(liquidoDe(q.preco, ctx!.regra)), Math.round(taxaEfetiva(q.preco, ctx!.regra) * 100));
      } catch {
        /* preço que a Steam não aceitaria: sem a linha de taxa */
      }
      // a estimativa em USD do CS2 (antes do histórico em BRL) não decide se compensa
      const barato = ctx!.moeda === MOEDA_SUPORTADA && q.fonte !== "estimado" && naoCompensa(q.preco);
      if (barato) baratos.add(id);
      const v = bonsPorNome.get(q.grupo.nome);
      if (v && !barato) bons.set(id, [descreverMotivos(v.motivos), linha].filter(Boolean).join("\n"));
      else outras.set(id, [linha, barato ? tx().taxaAltaDica : ""].filter(Boolean).join("\n"));
    }
    return { bons, baratos, outras };
  }

  /** Total sugerido no fim do painel: itens ainda não listados, pelo preço mostrado na grade. */
  function mostrarTotal(): void {
    if (!inventarioCompleto) return controles.total(null);
    // Só conta o preço depois do histórico em BRL; antes disso o CS2 tem só a estimativa em USD convertido.
    const precos = [...porQuadrado].filter(([id]) => !listados.has(id)).map(([, q]) => (concluidos.has(q.grupo.nome) ? q.preco : null));
    const liq = (c: number) => liquidoDe(c, ctx!.regra);
    controles.total(somarTotal(precos, liq));
    controles.totalSelecionados(somarTotal(selecionaveis().map((id) => porQuadrado.get(id)?.preco ?? null), liq));
  }

  /** Foto dos preços que ordena a grade; só muda ao carregar ou ao mexer nas opções (os itens não pulam ao refinar). */
  let precosOrdem = new Map<string, number | null>();
  /** quadrados "Not Marketable" (não vão ao mercado): o filtro manda para o fim */
  const naoVendaveis = new Set<string>();
  const congelarOrdem = () => void (precosOrdem = fotografarPrecos(porQuadrado, listados));
  const chaveDeOrdem = (id: string) =>
    chaveOrdem(id, {
      ordem: opcoes.ordem,
      ocultarListados: opcoes.ocultarListados,
      ocultarNaoVendaveis: opcoes.ocultarNaoVendaveis,
      naoVendaveis,
      copias,
      listados,
      aguardando,
      precos: precosOrdem,
      apenasBons: opcoes.apenasBons,
      bons: { has: (id: string) => bonsAtuais.has(id) || pendentesAtuais.has(id) },
      ocultarBaratos: opcoes.ocultarBaratos,
      baratos: baratosAtuais,
    });

  /** A grade mudou de ordem: um fade curto em vez de um salto seco (respeita "reduzir movimento"). */
  function suavizarGrade(): void {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelector("#inventories")?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  /** Agrupar itens iguais: cópias escondidas (não listadas) e a quantidade de cada representante. */
  const copias = new Set<string>();
  /** representante → todos os iguais não listados (para selecionar o grupo inteiro) */
  const membros = new Map<string, string[]>();
  function agruparIguais(): void {
    copias.clear();
    membros.clear();
    const quantidades = new Map<string, number>();
    if (opcoes.agrupar) {
      const vistos = new Set<Grupo>();
      for (const q of porQuadrado.values()) {
        if (vistos.has(q.grupo)) continue;
        vistos.add(q.grupo);
        const ids = q.grupo.ativos.map(idDe).filter((id) => porQuadrado.has(id) && !listados.has(id));
        if (ids.length === 0) continue;
        // o que está sendo vendido agora continua à vista; senão, o primeiro da Steam
        const rep = ids.find((id) => emVenda.has(id)) ?? (ids[0] as string);
        quantidades.set(rep, ids.length);
        membros.set(rep, ids);
        for (const id of ids) if (id !== rep) copias.add(id);
      }
    }
    marcarGrupos(document, quantidades, copias);
  }

  /** Botão de cada quadrado vendável: Listar pelo preço mostrado. */
  function acoesDosQuadrados(): Map<string, AcaoQuadrado[]> {
    const acoes = new Map<string, AcaoQuadrado[]>();
    for (const [id, q] of porQuadrado) {
      if (emVenda.has(id) || listados.has(id) || q.preco === null) continue;
      const n = membros.get(id)?.length ?? 1;
      acoes.set(id, [
        { acao: "selecionar", rotulo: "", aria: n > 1 ? tx().selecionarOsN(n) : tx().selecionarParaListar, marcado: selecionados.has(id) },
        { acao: "listar", rotulo: tx().listar, aria: tx().listarNoMercadoPor(formatar(q.preco)) },
      ]);
    }
    return acoes;
  }

  // Cada chamada leva um número; resposta de chamada antiga (outro jogo) é descartada.
  let seqCarregar = 0;
  const idDe = (a: Ativo) => `${a.appid}_${a.contextid}_${a.assetid}`;

  async function carregar(): Promise<void> {
    try {
      await carregarJogo();
    } catch (e) {
      controles.status(tx().erro(e instanceof Error ? e.message : String(e)));
    }
  }

  async function carregarJogo(): Promise<void> {
    const app = lerAppDaPagina(document, location.hash);
    if (!app) return controles.status(tx().semJogo);
    const jogoId = `${app.appid}_${app.contextid}`;
    const meu = ++seqCarregar;
    painel!.trocarJogo(jogoId);
    precosGrade.clear();
    listados.clear();
    aguardando.clear();
    selecionados.clear();
    porQuadrado.clear();
    naoVendaveis.clear();
    refinados.clear();
    concluidos.clear();
    historicos.clear();
    bonsPorNome.clear();
    inventarioCompleto = false;
    controles.status(""); // o carregamento não aparece na tela; o status só mostra erro
    // A página da Steam já tem o inventário (e marca o que está à venda); pedir de novo dava 500.
    const lido = await esperarInventarioDaPagina(() => pagina!.g_ActiveInventory, app.appid);
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    let todos: Ativo[];
    if (lido) {
      todos = lido.ativos.filter((a) => !a.listado);
      for (const a of lido.ativos) if (a.listado) listados.set(idDe(a), null);
      if (!lido.completo) aviso(tx().inventarioIncompleto, 15000);
    } else {
      const r = await enviar({ tipo: "inventario", steamid: ctx!.steamid, appid: app.appid, contextid: app.contextid, grupoId: jogoId });
      if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
      if (!r.ok) return controles.status(mensagemDe(r));
      todos = r.dados as Ativo[];
    }
    for (const a of todos) if (!a.marketable) naoVendaveis.add(idDe(a));
    const grupos = agrupar(todos);
    for (const g of grupos) for (const a of g.ativos) porQuadrado.set(idDe(a), { grupo: g, ativo: a, preco: null, fonte: "estimado" });
    inventarioCompleto = true;
    congelarOrdem();
    reaplicar();
    // Preço estimado de tudo num pedido só (CS2); o histórico da Steam refina depois, item a item.
    const massa = await enviar({ tipo: "precos-massa", appid: app.appid, nomes: grupos.map((g) => g.nome), moeda: ctx!.moeda, grupoId: jogoId });
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    if (massa.ok && massa.dados) {
      const precos = massa.dados as Record<string, number>;
      for (const g of grupos) {
        const p = Object.hasOwn(precos, g.nome) ? precos[g.nome] : undefined;
        if (typeof p === "number") {
          definirPreco(g, p, "estimado");
        }
      }
      congelarOrdem(); // ordena tudo uma vez, já pelo preço
      reaplicar();
    } else if (!massa.ok) {
      aviso(tx().precosRapidosIndisponiveis(mensagemDe(massa)), 10000);
    }
    // Preço anunciado dos itens já à venda (pelo assetid; o contexto da grade pode ser 2 ou 16).
    const an = await enviar({ tipo: "anuncios", appid: app.appid, grupoId: jogoId });
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    if (an.ok && an.dados) {
      const assetDe = (id: string) => id.slice(id.lastIndexOf("_") + 1);
      const conhecidos = new Map([...listados.keys()].map((id) => [assetDe(id), id]));
      for (const [id, preco] of Object.entries(an.dados as Record<string, number | null>)) {
        listados.set(conhecidos.get(assetDe(id)) ?? id, preco);
      }
      congelarOrdem();
      reaplicar();
    } else if (!an.ok) {
      aviso(tx().naoLeuListados(mensagemDe(an)), 15000);
    }
    controles.status(""); // carregou: o status some (só volta para erro ou limite da Steam)
    // O histórico da Steam (lento, 3 s por item) só para a página da grade que está na tela.
    void refinarVisiveis();
  }

  /** nomes cujo histórico da Steam já foi pedido nesta carga */
  const refinados = new Set<string>();
  /** histórico de cada item já refinado: ao trocar o perfil de venda, os preços se refazem sem pedir de novo */
  const historicos = new Map<string, Ponto[]>();

  /** Perfil trocado: refaz o preço de todos os itens que já têm histórico e reordena. */
  function repreciar(): void {
    const grupos = new Set([...porQuadrado.values()].map((q) => q.grupo));
    for (const g of grupos) {
      const h = historicos.get(g.nome);
      const s = h ? precoPaciente(h, Date.now(), perfil) : null;
      if (s) definirPreco(g, s.preco, s.q > 0.5 ? "ajustado" : "steam");
    }
    congelarOrdem();
    reaplicar();
  }

  /** nomes cujo histórico (BRL) já chegou ou não existe; só esses entram no total (a tabela do CS2 é estimativa em USD) */
  const concluidos = new Set<string>();
  let refinando = false;

  /** Refina pelo histórico da Steam os itens da página visível da grade; ao trocar de página, segue pelos novos. */
  async function refinarVisiveis(): Promise<void> {
    if (refinando) return;
    refinando = true;
    try {
      for (;;) {
        const meu = seqCarregar;
        const jogoId = painel!.jogoAtual();
        if (!inventarioCompleto || !jogoId) return;
        // Primeiro a página que está na tela; depois todos os outros grupos, para o total cobrir o inventário inteiro.
        const daPagina = [...new Set(idsVisiveis(document).flatMap((id) => porQuadrado.get(id)?.grupo ?? []))];
        const todosGrupos = [...new Set([...porQuadrado.values()].map((q) => q.grupo))];
        const g = proximoParaRefinar([...daPagina, ...todosGrupos], refinados);
        if (!g) return;
        refinados.add(g.nome);
        const r = await enviar({ tipo: "historico", appid: String(g.appid), nome: g.nome, grupoId: jogoId });
        if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) continue; // outra carga: segue com o estado novo
        if (!r.ok) {
          if (r.erro === "sessao" || r.erro === "limite") {
            refinados.delete(g.nome);
            controles.status(mensagemDe(r));
            return;
          }
          reaplicar(); // sem histórico por erro: fica de fora do total (não conta a estimativa em USD)
          continue;
        }
        concluidos.add(g.nome);
        const analise = avaliarMomento(r.dados as Ponto[], Date.now());
        if (analise?.bom) bonsPorNome.set(g.nome, analise);
        historicos.set(g.nome, r.dados as Ponto[]);
        const s = precoPaciente(r.dados as Ponto[], Date.now(), perfil);
        if (!s) {
          reaplicar(); // sem histórico: fica a estimativa e o total passa a contá-la
          continue;
        }
        definirPreco(g, s.preco, s.q > 0.5 ? "ajustado" : "steam");
        reaplicar();
      }
    } finally {
      refinando = false;
    }
  }

  function definirPreco(g: Grupo, precoBruto: number, fonte: FontePreco): void {
    // Abaixo do mínimo da Steam (BRL: R$ 0,18) a venda é recusada; mostra e lista pelo mínimo.
    const preco = Math.max(precoBruto, menorTotal(ctx!.regra));
    for (const a of g.ativos) {
      const id = idDe(a);
      if (emVenda.has(id) || listados.has(id)) continue;
      const q = porQuadrado.get(id);
      if (q) {
        q.preco = preco;
        q.fonte = fonte;
      }
      precosGrade.set(id, formatar(preco));
    }
  }

  const aviso = (t: string, ms = 6000, tipo?: "ok") => {
    painel!.avisar(t, tipo);
    if (timerAviso) clearTimeout(timerAviso);
    timerAviso = setTimeout(() => painel!.avisar(null), ms);
  };

  /** Clique no quadrado: lista aquele item pelo preço sugerido; a confirmação final é no app da Steam. */
  /**
   * Lista um quadrado pelo preço mostrado, depois de conferir o menor anúncio na Steam.
   * `silencioso`: não mostra aviso por item (a lista em lote resume no fim). Devolve se listou e, se não, por quê.
   */
  async function venderQuadrado(id: string, silencioso = false): Promise<{ ok: boolean; motivo?: string; parar?: boolean }> {
    /** `parar`: sessão expirada ou limite da Steam; o lote para em vez de insistir item a item */
    const falhar = (motivo: string, ms = 12000, parar = false) => {
      if (!silencioso) aviso(motivo, ms);
      return { ok: false, motivo, parar };
    };
    const q = porQuadrado.get(id);
    const preco = q?.preco ?? null;
    if (!q || preco === null || emVenda.has(id) || listados.has(id)) return { ok: false, motivo: tx().itemIndisponivel };
    if (vendendo) return falhar(tx().vendaEmAndamento, 6000);
    if (ctx!.moeda !== MOEDA_SUPORTADA) return falhar(tx().soBRL);
    vendendo = true;
    emVenda.add(id);
    const textoAntes = formatar(preco);
    try {
      precosGrade.set(id, tx().conferindo);
      reaplicar();
      const r = await enviar({ tipo: "preco", appid: String(q.grupo.appid), nome: q.grupo.nome, moeda: ctx!.moeda, pais: ctx!.pais, grupoId: painel!.jogoAtual() ?? "x" });
      if (!r.ok) return falhar(tx().naoConferiuMercado(mensagemDe(r)), 12000, r.erro === "sessao" || r.erro === "limite");
      const menor = (r.dados as DadosPreco).visao.menorAnuncio;
      const motivo = motivoParaNaoListar(preco, menor, q.fonte);
      if (motivo) {
        const ref = menor !== null ? ` (${tx().menorAnuncio(formatar(menor))})` : "";
        return falhar(tx().naoListei(q.grupo.nome, formatar(preco), `${motivo}${ref}`));
      }
      const liquido = liquidoDe(preco, ctx!.regra);
      if (!Number.isSafeInteger(liquido) || liquido < 1) return falhar(tx().precoInvalido);
      precosGrade.set(id, tx().listando);
      reaplicar();
      const espera = FOLGA_VENDA_MS - (Date.now() - ultimaVenda);
      if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
      const res = await vender(fetchVenda, { sessionid: ctx!.sessionid, steamid: ctx!.steamid }, q.ativo, liquido).finally(
        () => (ultimaVenda = Date.now()),
      );
      if (!res.ok) return falhar(tx().recusado(res.motivo), 15000);
      q.preco = null;
      precosGrade.delete(id);
      listados.set(id, preco);
      selecionados.delete(id);
      if (res.precisaConfirmar) aguardando.add(id);
      if (!silencioso) aviso(res.precisaConfirmar ? tx().listadoAprove : tx().listadoOk, 5000, "ok");
      return { ok: true };
    } catch (e) {
      if (e instanceof ErroSessao) return falhar(tx().erroSessao, 12000, true);
      if (e instanceof ErroLimite) return falhar(tx().erroLimite, 12000, true);
      return falhar(e instanceof Error ? e.message : tx().vendaRecusada);
    } finally {
      vendendo = false;
      emVenda.delete(id);
      if (q.preco !== null) precosGrade.set(id, textoAntes);
      reaplicar();
    }
  }

  /** Seleção para listar vários de uma vez (com "agrupar", marcar o quadrado marca o grupo inteiro). */
  const selecionados = new Set<string>();
  let lote: { feitos: number; total: number; parar: boolean } | null = null;

  const selecionaveis = () => [...selecionados].filter((id) => {
    const q = porQuadrado.get(id);
    return q && q.preco !== null && !listados.has(id);
  });

  function alternarSelecao(id: string): void {
    const ids = membros.get(id) ?? [id];
    const marcar = !selecionados.has(id);
    for (const x of ids) {
      if (marcar) selecionados.add(x);
      else selecionados.delete(x);
    }
    reaplicar();
  }

  /** "Listar N": lista os selecionados em sequência, cada um pelo seu preço; clicar de novo para depois do atual. */
  async function listarSelecionados(): Promise<void> {
    if (lote) {
      lote.parar = true;
      return;
    }
    if (vendendo) return aviso(tx().vendaEmAndamento, 6000);
    const fila = selecionaveis();
    if (fila.length === 0) return;
    lote = { feitos: 0, total: fila.length, parar: false };
    let listadosAgora = 0;
    const recusas: string[] = [];
    try {
      for (const id of fila) {
        if (lote.parar) break;
        reaplicar();
        const r = await venderQuadrado(id, true);
        lote.feitos++;
        if (r.ok) listadosAgora++;
        else if (r.motivo) recusas.push(r.motivo);
        if (r.parar) break; // sessão expirada ou limite da Steam: não adianta seguir
      }
    } finally {
      const parou = lote.parar && lote.feitos < lote.total;
      lote = null;
      reaplicar();
      const partes = listadosAgora > 0 ? [tx().loteListados(listadosAgora)] : [];
      if (recusas.length) partes.push(tx().loteNaoListados(recusas.length, recusas[0] as string));
      if (parou) partes.push(tx().parado);
      aviso(partes.join(" · "), recusas.length ? 12000 : 6000, recusas.length || listadosAgora === 0 ? undefined : "ok");
    }
  }

  // Só clique real do usuário (isTrusted) nos botões do quadrado (seleção e Listar); qualquer clique pode trocar a página da grade.
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    setTimeout(() => void refinarVisiveis(), 400);
    const alvo = acaoDoBotao(e.target);
    if (!alvo) return;
    e.preventDefault();
    e.stopPropagation();
    if (alvo.acao === "listar") void venderQuadrado(alvo.id);
    else if (alvo.acao === "selecionar" && !lote) alternarSelecao(alvo.id);
  }, true);

  window.addEventListener("hashchange", () => void carregar());
  // A Steam refaz os quadrados ao trocar de página da grade; reaplica as marcas (com folga para não repetir à toa).
  const grade = document.querySelector("#inventories");
  if (grade) {
    let pendente: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
      if (pendente || (!inventarioCompleto && precosGrade.size === 0 && listados.size === 0)) return;
      pendente = setTimeout(() => {
        pendente = undefined;
        reaplicar();
        void refinarVisiveis();
      }, 300);
    }).observe(grade, { childList: true, subtree: true });
  }
  await carregar();
}

void principal();
