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
  const fim = (e.ocultarListados && listado) || (e.ocultarNaoVendaveis && e.naoVendaveis.has(id));
  const k = [e.copias.has(id) ? 2 : fim ? 1 : 0];
  if (e.ordem !== "steam") {
    const preco = e.precos.get(id) ?? null;
    k.push(preco === null ? 1 : 0, preco === null ? 0 : e.ordem === "maior" ? -preco : preco);
  }
  return k;
}

/**
 * Próximo item da página visível para refinar pelo histórico da Steam. Itens com preço rápido (CS2) ficam
 * com ele: a grade mostra e ordena pela mesma fonte, e a Steam é conferida na hora de listar.
 */
export function proximoParaRefinar<G extends { nome: string }>(
  grupos: readonly G[],
  jaPedidos: ReadonlySet<string>,
  comPrecoRapido: ReadonlySet<string>,
): G | undefined {
  return grupos.find((g) => !jaPedidos.has(g.nome) && !comPrecoRapido.has(g.nome));
}
