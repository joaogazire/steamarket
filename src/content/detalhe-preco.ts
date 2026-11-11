import type { DadosPreco } from "../background/roteador.ts";
import { comprador, liquido } from "../core/taxas.ts";
import { sugerir, type Modo } from "../core/sugestao.ts";
import type { RegraTaxa } from "../core/tipos.ts";
import { textoParaCentavos } from "../steam/cliente.ts";

export interface PropsDetalhe {
  dados: DadosPreco;
  regra: RegraTaxa;
  formatar(centavos: number): string;
  /** chamado com o preço que o comprador paga, em centavos */
  aoSelecionar(precoComprador: number): void;
  /** em produção, só cliques reais do usuário (isTrusted) escolhem preço */
  exigirCliqueReal?: boolean;
}

const MODOS: { modo: Modo; rotulo: string }[] = [
  { modo: "rapido", rotulo: "Rápido" },
  { modo: "equilibrado", rotulo: "Equilibrado" },
  { modo: "paciente", rotulo: "Paciente" },
];

/** PRC-01 / SUG-03..06 / FEE-01. */
export function renderDetalhe(el: HTMLElement, p: PropsDetalhe): void {
  const doc = el.ownerDocument;
  el.replaceChildren();
  const { dados, regra, formatar } = p;

  const menorAnuncio = dados.ordens.menorAnuncio ?? dados.visao.menorAnuncio;
  const linha = (rotulo: string, v: number | null) => {
    const d = doc.createElement("div");
    d.className = "sv-linha";
    d.textContent = `${rotulo} ${v === null ? "—" : formatar(v)}`;
    return d;
  };
  el.append(linha("Última venda", ultimaVenda(dados)), linha("Menor anúncio", menorAnuncio), linha("Maior ordem", dados.ordens.maiorOrdemCompra));

  const ctx = { maiorOrdemCompra: dados.ordens.maiorOrdemCompra, menorAnuncio, historico: dados.historico };
  for (const { modo, rotulo } of MODOS) {
    const s = sugerir(modo, ctx);
    const caixa = doc.createElement("div");
    caixa.className = "sv-sugestao";
    const txt = doc.createElement("span");
    const recebe = s.preco === null ? null : liquidoSeguro(s.preco, regra);
    txt.textContent =
      s.preco === null
        ? `${rotulo} — (${s.base})`
        : `${rotulo} ${formatar(s.preco)} · recebe ${recebe === null ? "—" : formatar(recebe)} · ${s.base}`;
    const b = doc.createElement("button");
    b.textContent = "usar";
    b.disabled = s.preco === null;
    b.addEventListener("click", (e) => {
      if (p.exigirCliqueReal && !e.isTrusted) return;
      if (s.preco !== null) p.aoSelecionar(s.preco);
    });
    caixa.append(txt, b);
    el.append(caixa);
  }

  const minimo = comprador(1, regra);
  const manual = doc.createElement("div");
  manual.className = "sv-manual";
  const input = doc.createElement("input");
  input.className = "sv-preco";
  input.placeholder = "preço do comprador";
  const info = doc.createElement("span");
  const usar = doc.createElement("button");
  usar.className = "sv-usar";
  usar.textContent = "usar este preço";
  usar.disabled = true;
  input.addEventListener("input", () => {
    const c = textoParaCentavos(input.value);
    const ok = c !== null && c >= minimo;
    usar.disabled = !ok;
    info.textContent = ok ? `recebe ${formatar(liquido(c, regra))}` : `mínimo ${formatar(minimo)}`;
  });
  usar.addEventListener("click", (e) => {
    if (p.exigirCliqueReal && !e.isTrusted) return;
    const c = textoParaCentavos(input.value);
    if (c !== null && c >= minimo) p.aoSelecionar(c);
  });
  manual.append(input, info, usar);
  el.append(manual);
}

function liquidoSeguro(preco: number, regra: RegraTaxa): number | null {
  try {
    return liquido(preco, regra);
  } catch {
    return null;
  }
}

function ultimaVenda(d: DadosPreco): number | null {
  let melhor: { t: number; preco: number } | null = null;
  for (const x of d.historico) if (!melhor || x.t > melhor.t) melhor = x;
  return melhor?.preco ?? null;
}
