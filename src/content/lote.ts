import type { Lote, ResumoLote } from "../background/venda-lote.ts";
import { liquido } from "../core/taxas.ts";
import type { Ativo, RegraTaxa } from "../core/tipos.ts";

export interface PropsLote {
  ativos: Ativo[];
  /** preço que o comprador paga, em centavos */
  precoComprador: number;
  regra: RegraTaxa;
  formatar(centavos: number): string;
  menorAnuncio: number | null;
  iniciar(escolhidos: Ativo[], liquidoCentavos: number, aoProgredir: (feitos: number, total: number) => void): Lote;
  /** em produção, só cliques reais do usuário (isTrusted) iniciam a venda */
  exigirCliqueReal?: boolean;
}

const ABAIXO_DO_MERCADO = 0.5;
const MOTIVO_ABORTO: Record<string, string> = {
  sessao: "A sessão da Steam expirou. Entre de novo e recarregue.",
  limite: "A Steam limitou as requisições. Tente de novo em alguns minutos.",
  rede: "Falha de rede durante a venda.",
  formato: "A Steam respondeu de forma inesperada várias vezes seguidas. Venda interrompida.",
};

/** SEL-02 / SEL-05 / SEL-06: nada é enviado antes do clique de confirmação. */
export function renderLote(el: HTMLElement, p: PropsLote): void {
  const doc = el.ownerDocument;
  el.replaceChildren();
  const recebe = liquido(p.precoComprador, p.regra);
  const abaixo = p.menorAnuncio !== null && p.precoComprador < p.menorAnuncio * ABAIXO_DO_MERCADO;

  const qtd = doc.createElement("input");
  qtd.className = "sv-qtd";
  qtd.value = "1";
  const resumoTxt = doc.createElement("div");
  const confirmar = doc.createElement("button");
  confirmar.textContent = "Confirmar venda";
  const progresso = doc.createElement("div");
  progresso.className = "sv-progresso";

  const quantidade = (): number => {
    const n = Number.parseInt(qtd.value, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), p.ativos.length) : 1;
  };
  const atualizar = () => {
    const n = quantidade();
    resumoTxt.textContent = `Vender ${n} × ${p.formatar(p.precoComprador)} (recebe ${p.formatar(recebe)} cada, total ${p.formatar(recebe * n)})`;
  };
  qtd.addEventListener("input", atualizar);
  atualizar();

  let risco: HTMLInputElement | null = null;
  const linhas: Node[] = [qtd, resumoTxt];
  if (abaixo) {
    risco = doc.createElement("input");
    risco.type = "checkbox";
    risco.className = "sv-risco";
    const rotulo = doc.createElement("label");
    rotulo.append(risco, " Este preço está abaixo de 50% do menor anúncio. Quero vender mesmo assim.");
    linhas.push(rotulo);
    confirmar.disabled = true;
    risco.addEventListener("change", () => (confirmar.disabled = !risco?.checked));
  }
  linhas.push(confirmar, progresso);
  el.append(...linhas);

  confirmar.addEventListener("click", (e) => {
    if (p.exigirCliqueReal && !e.isTrusted) return;
    if (confirmar.disabled) return;
    const escolhidos = p.ativos.slice(0, quantidade());
    confirmar.disabled = true;
    qtd.disabled = true;
    const lote = p.iniciar(escolhidos, recebe, (k, n) => (progresso.textContent = `${k} de ${n}`));
    progresso.textContent = `0 de ${escolhidos.length}`;
    const cancelar = doc.createElement("button");
    cancelar.textContent = "cancelar";
    cancelar.addEventListener("click", () => lote.cancelar());
    el.append(cancelar);
    void lote.concluido.then(
      (r) => {
        cancelar.remove();
        mostrarResumo(progresso, r);
      },
      (e: unknown) => {
        cancelar.remove();
        progresso.textContent = `Erro: ${e instanceof Error ? e.message : "venda não iniciada"}`;
        qtd.disabled = false;
        confirmar.disabled = abaixo && !risco?.checked;
      },
    );
  });
}

function mostrarResumo(el: HTMLElement, r: ResumoLote): void {
  const doc = el.ownerDocument;
  el.replaceChildren();
  const linha = (t: string) => {
    const d = doc.createElement("div");
    d.textContent = t;
    return d;
  };
  el.append(linha(`Vendidos ${r.vendidos} · Recusados ${r.recusados.length}${r.cancelado ? " · cancelado" : ""}`));
  if (r.abortado) el.append(linha(MOTIVO_ABORTO[r.abortado] ?? "Venda interrompida."));
  for (const x of r.recusados) el.append(linha(`Item ${x.assetid}: ${x.motivo}`));
  if (r.vendidos > 0) {
    el.append(linha(`Confirme as vendas no celular (Steam Guard) para publicá-las: ${r.precisaConfirmar} aguardando.`));
  }
}
