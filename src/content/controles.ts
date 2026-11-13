/** Controles do painel: ocultar listados, ícones de agrupar e de ordenar por preço, o status e o total sugerido. */
import { tx } from "../core/i18n.ts";
import { reais, type Total } from "../core/total.ts";

export type Ordem = "steam" | "maior" | "menor";

/** Valor salvo (storage) → ordem válida; qualquer outra coisa volta ao padrão da Steam. */
export const lerOrdem = (v: unknown): Ordem => (v === "maior" || v === "menor" ? v : "steam");

export interface OpcoesPainel {
  ocultarListados: boolean;
  /** itens "Not Marketable" (não vão ao mercado) vão para o fim da grade */
  ocultarNaoVendaveis: boolean;
  /** ordem da grade: a da Steam ou por preço */
  ordem: Ordem;
  /** um quadrado por item, com a quantidade; as cópias ficam escondidas no fim */
  agrupar: boolean;
  /** só os itens marcados como bom momento para vender (borda dourada) */
  apenasBons: boolean;
  /** itens que não compensam vender (taxa alta) vão para o fim da grade */
  ocultarBaratos: boolean;
}

export interface CallbacksControles {
  aoMudar(o: OpcoesPainel): void;
  /** clique em "Listar N" (ou em "Parar" durante a venda) */
  aoListarSelecionados?(): void;
}

export interface ControlesPainel {
  progresso(k: number, n: number): void;
  status(texto: string): void;
  /** quantos itens estão selecionados e, durante a venda em lote, o progresso */
  selecao(n: number, rodando?: { feitos: number; total: number }): void;
  /** total sugerido dos itens à venda, no fim do painel; null esconde */
  total(t: Total | null): void;
  /** valor somado dos itens selecionados; null ou nenhum item esconde */
  totalSelecionados(t: Total | null): void;
}

const SVG = "http://www.w3.org/2000/svg";

/** Ícone SVG montado por DOM (sem innerHTML): `formas` = [tag, atributos]. */
function icone(doc: Document, formas: [string, Record<string, string>][], classe = ""): SVGSVGElement {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (classe) svg.setAttribute("class", classe);
  for (const [tag, attrs] of formas) {
    const f = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) f.setAttribute(k, v);
    svg.append(f);
  }
  return svg;
}

/** Onde vai cada parte (por padrão, tudo no próprio `el`). */
export interface LugaresControles {
  /** status, total e barra de seleção (com o "Listar N") */
  resumo?: HTMLElement;
}

/** `el`: os filtros (ocultar listados e Not Marketable) e os ícones de agrupar e de R$ com setinha. */
export function renderControles(
  el: HTMLElement,
  cb: CallbacksControles,
  inicial: Partial<OpcoesPainel> = {},
  { resumo = el }: LugaresControles = {},
): ControlesPainel {
  const doc = el.ownerDocument;
  for (const x of new Set([el, resumo])) x.replaceChildren();
  const estado: OpcoesPainel = { ocultarListados: true, ocultarNaoVendaveis: false, ordem: "steam", agrupar: false, apenasBons: false, ocultarBaratos: false, ...inicial };
  const avisar = () => cb.aoMudar({ ...estado });

  const botaoIcone = (classe: string): HTMLButtonElement => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = `sv-icone ${classe}`;
    return b;
  };

  // Filtros em ícone, liga/desliga (ligado = escondido no fim da grade).
  const filtro = (classe: string, rotulo: string, formas: [string, Record<string, string>][], chave: "ocultarListados" | "ocultarNaoVendaveis" | "apenasBons" | "ocultarBaratos") => {
    const b = botaoIcone(classe);
    b.append(icone(doc, formas));
    b.setAttribute("aria-label", rotulo);
    b.dataset.dica = rotulo;
    const mostrar = () => b.setAttribute("aria-pressed", String(estado[chave]));
    mostrar();
    b.addEventListener("click", () => {
      estado[chave] = !estado[chave];
      mostrar();
      avisar();
    });
    return b;
  };
  const filtros = doc.createElement("div");
  filtros.className = "sv-filtros";
  filtros.append(
    // etiqueta de preço: itens já anunciados
    filtro("sv-ocultar-listados-btn", tx().ocultarListados, [
      ["path", { d: "M2 2.5h5.3l6.4 6.4-4.8 4.8L2.5 7.3V2.5Z" }],
      ["circle", { cx: "5.3", cy: "5.6", r: "1" }],
    ], "ocultarListados"),
    // cadeado: itens que não vão ao mercado
    filtro("sv-nao-vendaveis-btn", tx().ocultarNaoVendaveis, [
      ["rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.6" }],
      ["path", { d: "M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" }],
    ], "ocultarNaoVendaveis"),
    // moeda riscada: itens em que a taxa da Steam come boa parte do preço
    filtro("sv-baratos-btn", tx().ocultarBaratos, [
      ["circle", { cx: "8", cy: "8", r: "6" }],
      ["path", { d: "M3.8 12.2 12.2 3.8" }],
    ], "ocultarBaratos"),
    // estrela dourada: só os bons negócios para vender agora
    filtro("sv-bons-btn", tx().apenasBons, [
      ["path", { d: "M8 1.8l1.9 3.9 4.2.6-3.1 3 .8 4.2L8 11.4l-3.8 2.1.8-4.2-3.1-3 4.2-.6L8 1.8Z" }],
    ], "apenasBons"),
  );

  // Agrupar itens iguais: ícone de pilha, liga/desliga.
  const agrupar = botaoIcone("sv-agrupar-btn");
  agrupar.append(
    icone(doc, [
      ["rect", { x: "5", y: "1.8", width: "9.2", height: "9.2", rx: "2" }],
      ["path", { d: "M2 5.2v7.3c0 .9.7 1.6 1.6 1.6h7.3" }],
    ]),
  );
  agrupar.setAttribute("aria-label", tx().agruparIguais);
  agrupar.dataset.dica = tx().agruparIguais;
  const mostrarAgrupar = () => agrupar.setAttribute("aria-pressed", String(estado.agrupar));
  mostrarAgrupar();
  agrupar.addEventListener("click", () => {
    estado.agrupar = !estado.agrupar;
    mostrarAgrupar();
    avisar();
  });

  // R$ com setinha: padrão (seta apagada) → maior primeiro (↓) → menor primeiro (↑, a seta gira).
  const TEXTOS: Record<Ordem, string> = {
    steam: tx().ordemSteam,
    maior: tx().ordemMaior,
    menor: tx().ordemMenor,
  };
  const PROXIMA: Record<Ordem, Ordem> = { steam: "maior", maior: "menor", menor: "steam" };
  const ordem = botaoIcone("sv-ordem-btn");
  const rs = doc.createElement("span");
  rs.className = "sv-rs";
  rs.textContent = "R$";
  ordem.append(rs, icone(doc, [["path", { d: "M8 2.5v11M3.8 9.3 8 13.5l4.2-4.2" }]], "sv-seta"));
  const mostrarOrdem = () => {
    ordem.dataset.ordem = estado.ordem;
    ordem.setAttribute("aria-label", tx().ordenarPorPreco(TEXTOS[estado.ordem]));
    ordem.dataset.dica = tx().ordenarPorPreco(TEXTOS[estado.ordem]);
    ordem.setAttribute("aria-pressed", String(estado.ordem !== "steam"));
  };
  mostrarOrdem();
  ordem.addEventListener("click", () => {
    estado.ordem = PROXIMA[estado.ordem];
    mostrarOrdem();
    avisar();
  });

  // Listar selecionados: aparece com a quantidade; durante a venda vira "Parar k/n".
  const listarSel = doc.createElement("button");
  listarSel.type = "button";
  listarSel.className = "sv-icone sv-listar-sel";
  listarSel.hidden = true;
  listarSel.addEventListener("click", () => cb.aoListarSelecionados?.());

  const status = doc.createElement("div");
  status.className = "sv-status";
  status.setAttribute("role", "status");
  const ferramentas = doc.createElement("div");
  ferramentas.className = "sv-ferramentas";
  ferramentas.append(agrupar, ordem);
  /** Troca o texto e, se mudou, o número sobe de leve (sem animação com "reduzir movimento"). */
  const trocarTexto = (alvo: HTMLElement, texto: string) => {
    if (alvo.textContent === texto) return;
    const antes = alvo.textContent;
    alvo.textContent = texto;
    const calmo = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    if (antes && !calmo && typeof alvo.animate === "function") {
      alvo.animate([{ opacity: 0.3, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], {
        duration: 300,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
    }
  };

  // Total numa linha: "Total R$ X (recebe R$ Y) · N itens".
  const itensDe = (t: Total) =>
    t.comPreco === t.itens ? tx().itens(t.itens) : tx().itensDe(t.comPreco, t.itens);
  const total = doc.createElement("div");
  total.className = "sv-total";
  total.hidden = true;
  const totalValor = doc.createElement("strong");
  const totalDetalhe = doc.createElement("span");
  totalDetalhe.className = "sv-mudo";
  // Anel de carregamento dos preços (itens com preço / itens da seção); some quando chega a 100%.
  const NS = "http://www.w3.org/2000/svg";
  const anel = doc.createElement("span");
  anel.className = "sv-anel";
  anel.hidden = true;
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const fundo = doc.createElementNS(NS, "circle");
  const arco = doc.createElementNS(NS, "circle");
  for (const [c, cls] of [[fundo, "sv-anel-fundo"], [arco, "sv-anel-arco"]] as const) {
    c.setAttribute("class", cls);
    c.setAttribute("cx", "10");
    c.setAttribute("cy", "10");
    c.setAttribute("r", "8");
    c.setAttribute("pathLength", "100");
  }
  arco.setAttribute("stroke-dasharray", "0 100");
  svg.append(fundo, arco);
  anel.append(svg); // a porcentagem sai do data-pct pelo CSS (fora do textContent do total)
  total.append(anel, `${tx().total} `, totalValor, " ", totalDetalhe);
  const mostrarTotal = (t: Total | null) => {
    total.hidden = !t || t.itens === 0;
    if (total.hidden || !t) return;
    const pct = Math.floor((t.comPreco / t.itens) * 100);
    anel.hidden = t.comPreco >= t.itens;
    arco.setAttribute("stroke-dasharray", `${pct} 100`);
    anel.dataset.pct = `${pct}%`;
    anel.title = tx().itensDe(t.comPreco, t.itens);
    trocarTexto(totalValor, reais(t.bruto));
    totalDetalhe.textContent = `(${tx().recebe(reais(t.liquido))}) · ${itensDe(t)}`;
  };

  // Barra de seleção: "N itens · R$ X (recebe R$ Y)" e o "Listar N" no fim; à vista com seleção ou durante a venda.
  const barraSel = doc.createElement("div");
  barraSel.className = "sv-sel";
  barraSel.hidden = true;
  const selTexto = doc.createElement("span");
  selTexto.className = "sv-sel-texto";
  const selItens = doc.createElement("strong");
  const selValor = doc.createTextNode("");
  const selRecebe = doc.createElement("span");
  selRecebe.className = "sv-mudo";
  selTexto.append(selItens, selValor, selRecebe);
  barraSel.append(selTexto, listarSel);
  let temSelecao = false;
  let emLote = false;
  const mostrarBarraSel = () => void (barraSel.hidden = !temSelecao && !emLote);
  const mostrarSel = (t: Total | null) => {
    temSelecao = Boolean(t && t.itens > 0);
    if (t && temSelecao) {
      trocarTexto(selItens, tx().itens(t.itens));
      selValor.textContent = ` · ${reais(t.bruto)} `;
      selRecebe.textContent = `(${tx().recebe(reais(t.liquido))})`;
    }
    selTexto.hidden = !temSelecao;
    mostrarBarraSel();
  };

  el.append(filtros, ferramentas);
  resumo.append(status, total, barraSel);
  return {
    progresso: (k, n) => void (status.textContent = tx().precosKN(k, n)),
    status: (t) => void (status.textContent = t),
    selecao(n, rodando) {
      listarSel.hidden = n === 0 && !rodando;
      emLote = Boolean(rodando);
      mostrarBarraSel();
      listarSel.classList.toggle("sv-rodando", Boolean(rodando));
      const texto = rodando ? tx().pararKN(rodando.feitos, rodando.total) : tx().listarN(n);
      const aria = rodando ? tx().pararAria(rodando.feitos, rodando.total) : tx().listarOsN(n);
      if (listarSel.textContent !== texto) listarSel.textContent = texto;
      listarSel.setAttribute("aria-label", aria);
    },
    total: mostrarTotal,
    totalSelecionados: mostrarSel,
  };
}
