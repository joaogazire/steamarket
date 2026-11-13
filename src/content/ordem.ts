/**
 * Ordem da grade. A ordem por preço usa uma foto dos preços, tirada ao carregar ou ao mudar as opções:
 * o refino pelo histórico da Steam muda o texto do preço, mas não tira os itens do lugar.
 */
import type { Ordem } from "./controles.ts";

export interface EstadoOrdem {
  ordem: Ordem;
  ocultarListados: boolean;
  ocultarNaoVendaveis: boolean;
  /** itens "Not Marketable" */
  naoVendaveis: ReadonlySet<string>;
  /** cópias escondidas pelo "agrupar": vão para o fim de tudo */
  copias: ReadonlySet<string>;
  listados: ReadonlyMap<string, number | null>;
  /** recém-listados esperando aprovação: ficam no lugar */
  aguardando: ReadonlySet<string>;
  /** foto dos preços (fotografarPrecos) */
  precos: ReadonlyMap<string, number | null>;
  /** filtro "só bons negócios": quem não está em `bons` vai para o fim */
  apenasBons?: boolean;
  bons?: { has(id: string): boolean };
  /** filtro "ocultar itens que não compensam" (taxa alta): vão para o fim */
  ocultarBaratos?: boolean;
  baratos?: { has(id: string): boolean };
}

/** Preço de cada quadrado agora: o sugerido dos itens à venda e o anunciado dos listados. */
export function fotografarPrecos(
  aVenda: ReadonlyMap<string, { preco: number | null }>,
  listados: ReadonlyMap<string, number | null>,
): Map<string, number | null> {
  const foto = new Map<string, number | null>();
  for (const [id, q] of aVenda) foto.set(id, q.preco);
  for (const [id, p] of listados) if (!foto.has(id) || foto.get(id) === null) foto.set(id, p);
  return foto;
}

/** Chave lexicográfica: [cópia 2 | listado 1 | resto 0] e, por preço, [sem preço 1 | 0, ±preço]. Empate = ordem da Steam. */
export function chaveDeOrdem(id: string, e: EstadoOrdem): number[] {
  const listado = e.listados.has(id) && !e.aguardando.has(id);
  const fim = (e.ocultarListados && listado) || (e.ocultarNaoVendaveis && e.naoVendaveis.has(id)) || (e.apenasBons === true && !e.bons?.has(id)) || (e.ocultarBaratos === true && e.baratos?.has(id) === true);
  const k = [e.copias.has(id) ? 2 : fim ? 1 : 0];
  if (e.ordem !== "steam") {
    const preco = e.precos.get(id) ?? null;
    k.push(preco === null ? 1 : 0, preco === null ? 0 : e.ordem === "maior" ? -preco : preco);
  }
  return k;
}

/**
 * Próximo item para refinar pelo histórico da Steam (em BRL). O preço rápido da tabela do CS2 é em USD convertido
 * e pode ficar muito longe do mercado em reais; serve só de estimativa até o histórico chegar.
 */
export function proximoParaRefinar<G extends { nome: string }>(grupos: readonly G[], jaPedidos: ReadonlySet<string>): G | undefined {
  return grupos.find((g) => !jaPedidos.has(g.nome));
}
