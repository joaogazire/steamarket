import uPlot from "uplot";
import cssUplot from "uplot/dist/uPlot.min.css";
import type { DadosPreco, Resposta } from "../background/roteador.ts";
import { agrupar } from "../core/agrupar.ts";
import { REGRA_PADRAO, type Ativo, type Grupo } from "../core/tipos.ts";
import { lerAppDoHash, lerContexto } from "./contexto.ts";
import cssPainel from "./estilo.css";
import { renderDetalhe } from "./detalhe-preco.ts";
import { renderGrafico, type CriarPlot } from "./grafico.ts";
import { renderLista } from "./lista-grupos.ts";
import { montarPainel } from "./painel.ts";

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
  document.head.append(estilo);

  const porta = browser.runtime.connect({ name: "painel" });
  porta.onMessage.addListener((m) => {
    const msg = m as { tipo?: string; ms?: number };
    if (msg.tipo === "pausa" && typeof msg.ms === "number") {
      painel.avisar(`aguardando limite da Steam (${Math.round(msg.ms / 1000)} s)`);
      setTimeout(() => painel.avisar(null), msg.ms);
    }
  });

  const formatar = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
  const detalhe = document.createElement("div");
  detalhe.className = "sv-detalhe";
  const grafico = document.createElement("div");

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
    renderDetalhe(detalhe, { dados, regra: REGRA_PADRAO, formatar, aoSelecionar: () => undefined });
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
