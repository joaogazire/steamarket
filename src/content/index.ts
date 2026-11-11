import uPlot from "uplot";
import cssUplot from "uplot/dist/uPlot.min.css";
import type { DadosPreco, Resposta } from "../background/roteador.ts";
import { agrupar } from "../core/agrupar.ts";
import type { Ativo, Grupo } from "../core/tipos.ts";
import { lerAppDoHash, lerContexto } from "./contexto.ts";
import cssPainel from "./estilo.css";
import { renderDetalhe } from "./detalhe-preco.ts";
import { renderGrafico, type CriarPlot } from "./grafico.ts";
import { renderLista } from "./lista-grupos.ts";
import { renderLote } from "./lote.ts";
import type { Lote, ResumoLote } from "../background/venda-lote.ts";
import { montarPainel } from "./painel.ts";
import { tratarPorta } from "./porta.ts";

/** A formatação de preços é em reais; outras moedas não vendem até serem suportadas (BRL = 7 na Steam). */
const MOEDA_SUPORTADA = 7;

const criarPlot: CriarPlot = (el, dados, nomes) =>
  new uPlot(
    {
      width: Math.max(300, el.clientWidth || 600),
      height: 220,
      series: [
        {},
        { label: nomes.preco, stroke: "#66c0f4", value: (_u, v) => (v == null ? "—" : (v / 100).toFixed(2)) },
        { label: nomes.volume, stroke: "#8fbc8f", scale: "vol" },
      ],
      scales: { vol: { auto: true } },
      axes: [{}, { values: (_u, ticks) => ticks.map((t) => (t / 100).toFixed(2)) }, { scale: "vol", side: 1, grid: { show: false } }],
    },
    dados,
    el,
  );

async function principal(): Promise<void> {
  // Firefox: as variáveis globais da página ficam em wrappedJSObject.
  const pagina = (window as unknown as { wrappedJSObject?: Record<string, unknown> }).wrappedJSObject;
  const ctx = pagina ? lerContexto(pagina) : null;
  if (!ctx) return;

  const enviar = (m: unknown) => browser.runtime.sendMessage(m) as Promise<Resposta>;
  const painel = montarPainel(document, ctx, (m) => void enviar(m));
  if (!painel) return;

  const estilo = document.createElement("style");
  estilo.textContent = cssUplot + cssPainel;
  painel.raiz.append(estilo);

  const progressos = new Map<string, (k: number, n: number) => void>();
  const porta = browser.runtime.connect({ name: "painel" });
  porta.onMessage.addListener((m) =>
    tratarPorta(m, { avisar: (t) => painel.avisar(t), progresso: (id, k, n) => progressos.get(id)?.(k, n) }),
  );

  const formatar = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  const detalhe = document.createElement("div");
  detalhe.className = "sv-detalhe";
  const grafico = document.createElement("div");
  const areaLote = document.createElement("div");
  let contadorLote = 0;
  let loteAtivo: Lote | null = null;

  function iniciarVenda(grupo: Grupo, ativos: Ativo[], liquido: number, prog: (k: number, n: number) => void): Lote {
    const loteId = `${painel!.jogoAtual() ?? "x"}-${Date.now()}-${++contadorLote}`;
    progressos.set(loteId, prog);
    const concluido = enviar({
      tipo: "lote-iniciar", loteId, sessionid: ctx!.sessionid, steamid: ctx!.steamid, liquido,
      ativos: ativos.map((a) => ({ assetid: a.assetid, appid: a.appid, contextid: a.contextid })),
    }).then((r) => {
      const x = r as unknown as { ok: boolean; resumo?: ResumoLote; mensagem?: string };
      if (!x.ok || !x.resumo) throw new Error(x.mensagem ?? "venda recusada");
      // os itens são processados em ordem; o que foi processado e não recusado foi vendido
      const processados = ativos.slice(0, x.resumo.vendidos + x.resumo.recusados.length);
      const recusados = new Set(x.resumo.recusados.map((r) => r.assetid));
      const vendidos = new Set(processados.filter((a) => !recusados.has(a.assetid)).map((a) => a.assetid));
      grupo.ativos = grupo.ativos.filter((a) => !vendidos.has(a.assetid));
      grupo.contagem = grupo.ativos.length;
      return x.resumo;
    }).finally(() => {
      progressos.delete(loteId);
      loteAtivo = null;
    });
    loteAtivo = { cancelar: () => void enviar({ tipo: "lote-cancelar", loteId }), concluido };
    return loteAtivo;
  }

  // Cada chamada leva um número; resposta de chamada antiga (outro grupo ou outro jogo) é descartada.
  let seqAbrir = 0;
  let seqCarregar = 0;

  async function abrir(grupo: Grupo, jogoId: string): Promise<void> {
    const meu = ++seqAbrir;
    detalhe.textContent = "carregando preços…";
    grafico.replaceChildren();
    const r = await enviar({ tipo: "preco", appid: String(grupo.appid), nome: grupo.nome, moeda: ctx!.moeda, pais: ctx!.pais, grupoId: jogoId });
    if (meu !== seqAbrir || painel!.jogoAtual() !== jogoId) return;
    if (!r.ok) {
      detalhe.textContent = r.mensagem;
      return;
    }
    const dados = r.dados as DadosPreco;
    areaLote.replaceChildren();
    renderDetalhe(detalhe, {
      dados,
      regra: ctx!.regra,
      formatar,
      exigirCliqueReal: true,
      aoSelecionar: (preco) =>
        loteAtivo
          ? (painel!.avisar("já existe uma venda em andamento; cancele ou espere terminar"), void setTimeout(() => painel!.avisar(null), 4000))
          : ctx!.moeda !== MOEDA_SUPORTADA
          ? void (areaLote.textContent = "A venda em lote só funciona com carteira em reais (BRL) nesta versão.")
          : renderLote(areaLote, {
          ativos: grupo.ativos,
          precoComprador: preco,
          regra: ctx!.regra,
          formatar,
          menorAnuncio: dados.ordens.menorAnuncio ?? dados.visao.menorAnuncio,
          iniciar: (e, l, p) => iniciarVenda(grupo, e, l, p),
          exigirCliqueReal: true,
        }),
    });
    detalhe.append(areaLote);
    renderGrafico(grafico, {
      pontos: dados.historico,
      ordens: { menorAnuncio: dados.ordens.menorAnuncio, maiorOrdem: dados.ordens.maiorOrdemCompra },
      agora: Date.now(),
      criarPlot,
      formatar,
    });
  }

  async function carregar(): Promise<void> {
    const app = lerAppDoHash(location.hash);
    if (!app) return;
    const jogoId = `${app.appid}_${app.contextid}`;
    const meu = ++seqCarregar;
    seqAbrir++;
    loteAtivo?.cancelar(); // trocar de jogo ou recarregar a lista interrompe a venda em curso
    painel!.trocarJogo(jogoId);
    detalhe.replaceChildren();
    grafico.replaceChildren();
    const lista = painel!.conteudo;
    renderLista(lista, { tipo: "carregando" }, { aoExpandir: () => undefined, aoTentar: () => undefined });
    const r = await enviar({ tipo: "inventario", steamid: ctx!.steamid, appid: app.appid, contextid: app.contextid, grupoId: jogoId });
    if (meu !== seqCarregar || painel!.jogoAtual() !== jogoId) return;
    const cb = { aoExpandir: (g: Grupo) => void abrir(g, jogoId), aoTentar: () => void carregar() };
    if (!r.ok) return renderLista(lista, { tipo: "erro", mensagem: r.mensagem }, cb);
    renderLista(lista, { tipo: "ok", grupos: agrupar(r.dados as Ativo[]) }, cb);
    lista.append(detalhe, grafico);
  }

  window.addEventListener("hashchange", () => void carregar());
  await carregar();
}

void principal();
