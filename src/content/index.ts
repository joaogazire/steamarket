/** Ponto de entrada do content script: preço sugerido em cada quadrado do inventário e venda com um clique. */
import type { Resposta } from "../background/roteador.ts";
import { agrupar } from "../core/agrupar.ts";
import { motivoParaNaoListar, sugerir, type FontePreco } from "../core/sugestao.ts";
import { liquido as liquidoDe } from "../core/taxas.ts";
import type { Ativo, Grupo, Ponto } from "../core/tipos.ts";
import { renderControles, type OpcoesPainel } from "./controles.ts";
import { lerAppDaPagina, lerContexto } from "./contexto.ts";
import cssPainel from "./estilo.css";
import { esperarInventarioDaPagina } from "./inventario-pagina.ts";
import { aplicarPrecos, idDoQuadrado, idsVisiveis, marcarListados, ordenarListados } from "./overlay.ts";
import { montarPainel, posicionar } from "./painel.ts";
import { tratarPorta } from "./porta.ts";
import type { DadosPreco } from "../background/roteador.ts";
import { vender } from "../steam/cliente.ts";
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

  const formatar = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  let opcoes: OpcoesPainel = { ocultarListados: false, cliqueLista: false };
  const controles = renderControles(painel.conteudo, { aoMudar: (o) => ((opcoes = o), reaplicar()) });

  /** id do quadrado na Steam (appid_contextid_assetid) → texto do preço sugerido exibido por cima dele */
  const precosGrade = new Map<string, string>();
  /** quadrados de itens já anunciados → preço anunciado (centavos) */
  const listados = new Map<string, number | null>();
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

  /** Listados = itens que a página marca como "On Market" (+ mylistings, que traz o preço anunciado). */
  function reaplicar(): void {
    posicionar(painel!.el, document);
    aplicarPrecos(document, precosGrade);
    marcarListados(document, listados, formatar, false);
    ordenarListados(document, (id) => listados.has(id), opcoes.ocultarListados);
  }

  // Cada chamada leva um número; resposta de chamada antiga (outro jogo) é descartada.
  let seqCarregar = 0;
  const idDe = (a: Ativo) => `${a.appid}_${a.contextid}_${a.assetid}`;

  async function carregar(): Promise<void> {
    try {
      await carregarJogo();
    } catch (e) {
      controles.status(`erro: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function carregarJogo(): Promise<void> {
    const app = lerAppDaPagina(document, location.hash);
    if (!app) return controles.status("não achei o jogo aberto (hash vazio)");
    const jogoId = `${app.appid}_${app.contextid}`;
    const meu = ++seqCarregar;
    painel!.trocarJogo(jogoId);
    precosGrade.clear();
    listados.clear();
    porQuadrado.clear();
    refinados.clear();
    inventarioCompleto = false;
    controles.status("lendo o inventário da página…");
    // A página da Steam já tem o inventário (e marca o que está à venda); pedir de novo dava 500.
    const lido = await esperarInventarioDaPagina(() => pagina!.g_ActiveInventory, app.appid);
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    let todos: Ativo[];
    if (lido) {
      todos = lido.ativos.filter((a) => !a.listado);
      for (const a of lido.ativos) if (a.listado) listados.set(idDe(a), null);
      if (!lido.completo) aviso("a página ainda não carregou o inventário todo; parte dos itens fica sem preço", 15000);
    } else {
      controles.status("carregando inventário…");
      const r = await enviar({ tipo: "inventario", steamid: ctx!.steamid, appid: app.appid, contextid: app.contextid, grupoId: jogoId });
      if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
      if (!r.ok) return controles.status(r.mensagem);
      todos = r.dados as Ativo[];
    }
    const grupos = agrupar(todos);
    for (const g of grupos) for (const a of g.ativos) porQuadrado.set(idDe(a), { grupo: g, ativo: a, preco: null, fonte: "estimado" });
    inventarioCompleto = true;
    reaplicar();
    // Preço estimado de tudo num pedido só (CS2); o histórico da Steam refina depois, item a item.
    controles.status("buscando preços…");
    const massa = await enviar({ tipo: "precos-massa", appid: app.appid, nomes: grupos.map((g) => g.nome), moeda: ctx!.moeda, grupoId: jogoId });
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    if (massa.ok && massa.dados) {
      const precos = massa.dados as Record<string, number>;
      for (const g of grupos) {
        const p = Object.hasOwn(precos, g.nome) ? precos[g.nome] : undefined;
        if (typeof p === "number") definirPreco(g, p, "estimado");
      }
      reaplicar();
    } else if (!massa.ok) {
      aviso(`preços rápidos indisponíveis (${massa.mensagem}); seguindo pelo histórico da Steam`, 10000);
    }
    // Preço anunciado dos itens já à venda (pelo assetid; o contexto da grade pode ser 2 ou 16).
    controles.status("buscando itens já listados…");
    const an = await enviar({ tipo: "anuncios", appid: app.appid, grupoId: jogoId });
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    if (an.ok && an.dados) {
      const assetDe = (id: string) => id.slice(id.lastIndexOf("_") + 1);
      const conhecidos = new Map([...listados.keys()].map((id) => [assetDe(id), id]));
      for (const [id, preco] of Object.entries(an.dados as Record<string, number | null>)) {
        listados.set(conhecidos.get(assetDe(id)) ?? id, preco);
      }
      reaplicar();
    } else if (!an.ok) {
      aviso(`não consegui ler os itens já listados: ${an.mensagem}`, 15000);
    }
    // O histórico da Steam (lento, 3 s por item) só para a página da grade que está na tela.
    void refinarVisiveis();
  }

  /** nomes cujo histórico da Steam já foi pedido nesta carga */
  const refinados = new Set<string>();
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
        const daPagina = [...new Set(idsVisiveis(document).flatMap((id) => porQuadrado.get(id)?.grupo ?? []))];
        const g = daPagina.find((x) => !refinados.has(x.nome));
        if (!g) {
          if (daPagina.length > 0) controles.status(`preços da página: ${daPagina.length}/${daPagina.length}`);
          return;
        }
        refinados.add(g.nome);
        controles.status(`preços da página: ${daPagina.filter((x) => refinados.has(x.nome)).length}/${daPagina.length}`);
        const r = await enviar({ tipo: "historico", appid: String(g.appid), nome: g.nome, grupoId: jogoId });
        if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) continue; // outra carga: segue com o estado novo
        if (!r.ok) {
          if (r.erro === "sessao" || r.erro === "limite") {
            refinados.delete(g.nome);
            controles.status(r.mensagem);
            return;
          }
          continue;
        }
        const s = sugerir("equilibrado", { historico: r.dados as Ponto[], maiorOrdemCompra: null, menorAnuncio: null });
        if (s.preco === null) continue;
        definirPreco(g, s.preco, "steam");
        reaplicar();
      }
    } finally {
      refinando = false;
    }
  }

  function definirPreco(g: Grupo, preco: number, fonte: FontePreco): void {
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

  const aviso = (t: string, ms = 6000) => {
    painel!.avisar(t);
    if (timerAviso) clearTimeout(timerAviso);
    timerAviso = setTimeout(() => painel!.avisar(null), ms);
  };

  /** Clique no quadrado: lista aquele item pelo preço sugerido; a confirmação final é no app da Steam. */
  async function venderQuadrado(id: string): Promise<void> {
    const q = porQuadrado.get(id);
    if (!q || q.preco === null || emVenda.has(id) || listados.has(id)) return;
    if (vendendo) return aviso("já existe uma venda em andamento; espere terminar");
    if (ctx!.moeda !== MOEDA_SUPORTADA) return aviso("A venda só funciona com carteira em reais (BRL) nesta versão.");
    const preco = q.preco;
    vendendo = true;
    emVenda.add(id);
    const textoAntes = formatar(preco);
    try {
      precosGrade.set(id, "conferindo…");
      reaplicar();
      aviso("conferindo o mercado…", 20000);
      const r = await enviar({ tipo: "preco", appid: String(q.grupo.appid), nome: q.grupo.nome, moeda: ctx!.moeda, pais: ctx!.pais, grupoId: painel!.jogoAtual() ?? "x" });
      if (!r.ok) return aviso(`não consegui conferir o mercado (${r.mensagem})`);
      const menor = (r.dados as DadosPreco).visao.menorAnuncio;
      const motivo = motivoParaNaoListar(preco, menor, q.fonte);
      if (motivo) {
        const ref = menor !== null ? ` (menor anúncio ${formatar(menor)})` : "";
        return aviso(`${q.grupo.nome}: ${formatar(preco)} ${motivo}${ref}; não listei`, 12000);
      }
      const liquido = liquidoDe(preco, ctx!.regra);
      if (!Number.isSafeInteger(liquido) || liquido < 1) return aviso("preço inválido para venda");
      precosGrade.set(id, "listando…");
      reaplicar();
      aviso(`listando ${q.grupo.nome} por ${formatar(preco)}…`, 15000);
      const espera = FOLGA_VENDA_MS - (Date.now() - ultimaVenda);
      if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
      const res = await vender(fetchVenda, { sessionid: ctx!.sessionid, steamid: ctx!.steamid }, q.ativo, liquido).finally(
        () => (ultimaVenda = Date.now()),
      );
      if (res.ok) {
        q.preco = null;
        precosGrade.delete(id);
        listados.set(id, preco);
        aviso(res.precisaConfirmar ? "listado: falta aprovar no app da Steam no celular" : "listado no mercado", 15000);
      } else {
        aviso(`recusado: ${res.motivo}`, 15000);
      }
    } catch (e) {
      aviso(e instanceof Error ? e.message : "venda recusada");
    } finally {
      vendendo = false;
      emVenda.delete(id);
      if (q.preco !== null) precosGrade.set(id, textoAntes);
      reaplicar();
    }
  }

  // Só clique real do usuário (isTrusted) em quadrado conhecido, com a opção ligada. O clique segue normal para a Steam.
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    // trocar de página da grade (setas da Steam) muda os itens visíveis
    setTimeout(() => void refinarVisiveis(), 400);
    if (!opcoes.cliqueLista) return;
    const id = idDoQuadrado(e.target);
    if (id) void venderQuadrado(id);
  });

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
