import { analisar } from "../core/analise.ts";
import type { Ponto } from "../core/tipos.ts";

const DIA_MS = 86_400_000;
const JANELAS = [7, 30, 90] as const;

export type Serie = [number[], number[], number[]];

export interface PlotLike {
  destroy(): void;
}
export type CriarPlot = (el: HTMLElement, dados: Serie, opcoes: { preco: string; volume: string }) => PlotLike;

export interface PropsGrafico {
  pontos: Ponto[];
  ordens: { menorAnuncio: number | null; maiorOrdem: number | null };
  agora: number;
  criarPlot: CriarPlot;
  formatar?(centavos: number): string;
}

/** CHT-01: recorta a janela e separa tempo (s), preço (centavos) e volume. */
export function prepararSerie(pontos: Ponto[], dias: number, agora: number): Serie {
  const corte = agora - dias * DIA_MS;
  const j = pontos.filter((p) => p.t >= corte).sort((a, b) => a.t - b.t);
  return [j.map((p) => Math.floor(p.t / 1000)), j.map((p) => p.preco), j.map((p) => p.volume)];
}

/** CHT-01 / CHT-02 / CHT-03. */
export function renderGrafico(el: HTMLElement, p: PropsGrafico): void {
  const doc = el.ownerDocument;
  const fmt = p.formatar ?? ((c: number) => (c / 100).toFixed(2));
  el.replaceChildren();
  const barra = doc.createElement("div");
  barra.className = "sv-janelas";
  const metricas = doc.createElement("div");
  metricas.className = "sv-metricas";
  const area = doc.createElement("div");
  area.className = "sv-plot";
  el.append(barra, metricas, area);

  let plot: PlotLike | null = null;
  const desenhar = (dias: number) => {
    plot?.destroy();
    plot = null;
    area.replaceChildren();
    for (const b of barra.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.dias === String(dias)));
    const a = analisar(p.pontos, dias, p.ordens, p.agora);
    if (a === "insuficiente") {
      metricas.textContent = "dados insuficientes";
      return;
    }
    const sinal = a.tendenciaPct >= 0 ? "+" : "";
    metricas.textContent =
      `Tendência ${sinal}${a.tendenciaPct.toFixed(1)}% · Volatilidade ${(a.volatilidade * 100).toFixed(1)}% · ` +
      `Spread ${a.spread === null ? "—" : fmt(a.spread)}`;
    plot = p.criarPlot(area, prepararSerie(p.pontos, dias, p.agora), { preco: "Preço", volume: "Volume" });
  };

  for (const d of JANELAS) {
    const b = doc.createElement("button");
    b.textContent = `${d} dias`;
    b.dataset.dias = String(d);
    b.addEventListener("click", () => desenhar(d));
    barra.append(b);
  }
  desenhar(30);
}
