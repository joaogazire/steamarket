/** Relistar: tira o anúncio e lista o mesmo item de novo pelo preço sugerido pelo perfil. */
import { tx } from "../core/i18n.ts";
import { motivoParaNaoListar, type FontePreco } from "../core/sugestao.ts";
import { liquido as liquidoDe } from "../core/taxas.ts";
import type { Ativo, RegraTaxa } from "../core/tipos.ts";
import type { ResultadoVenda } from "../steam/cliente.ts";
import { reais } from "../core/total.ts";

export interface DepsRelistar {
  regra: RegraTaxa;
  /** trava de preço ligada (padrão); o usuário pode desligar no menu do inventário */
  travar: boolean;
  /** menor anúncio atual do item na Steam (centavos) ou null */
  menorAnuncio(): Promise<number | null>;
  remover(listingId: string): Promise<void>;
  inventario(): Promise<Ativo[]>;
  vender(ativo: Ativo, liquidoCentavos: number): Promise<ResultadoVenda>;
  esperar(ms: number): Promise<void>;
  /** chave appid:nome do anúncio ativo com esse id (lida de /market/mylistings), ou null se ele não existe mais */
  anuncio(listingId: string): Promise<string | null>;
}

export interface PedidoRelistar {
  listingId: string;
  appid: string;
  nome: string;
  /** preço sugerido que o comprador paga (centavos) */
  preco: number;
  fonte: FontePreco;
  /** preço atual deste anúncio (o comprador paga, centavos): se for o menor anúncio da Steam, ele não serve de referência */
  meuPreco?: number | null;
  /** preço do perfil rápido (≈ mediana das vendas recentes da Steam, centavos): referência da trava quando o menor anúncio é o próprio */
  mediana?: number | null;
}

export type ResultadoRelistar = { ok: true; precisaConfirmar: boolean } | { ok: false; motivo: string; removido?: boolean };

const TENTATIVAS_INVENTARIO = 5;
const ESPERA_MS = 1500;
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Ordem pensada para não perder nada: primeiro confere o mercado (nada mudou se falhar), depois remove,
 * depois acha o item de volta no inventário e lista. Se algo falha depois de remover, o item está no inventário.
 */
export async function relistarAnuncio(d: DepsRelistar, p: PedidoRelistar): Promise<ResultadoRelistar> {
  let liquido: number;
  try {
    let menor = await d.menorAnuncio();
    // o menor anúncio pode ser este mesmo (anunciado barato demais): aí compara com a mediana das vendas da Steam
    // (sem mediana, mantém o menor anúncio: nunca fica sem referência). Empate com outro vendedor no mesmo preço
    // também cai aqui; a mediana segue sendo uma referência real do mercado.
    if (menor !== null && p.meuPreco != null && menor === p.meuPreco && p.mediana != null) menor = p.mediana;
    const motivo = motivoParaNaoListar(p.preco, menor, p.fonte, d.travar);
    if (motivo) return { ok: false, motivo: tx().relistarFalha(`${motivo}${menor !== null ? ` (${tx().menorAnuncio(reais(menor))})` : ""}`) };
    liquido = liquidoDe(p.preco, d.regra);
    if (!Number.isSafeInteger(liquido) || liquido < 1) return { ok: false, motivo: tx().relistarFalha(tx().precoInvalido) };
  } catch (e) {
    return { ok: false, motivo: tx().relistarFalha(msg(e)) };
  }
  const mesmoItem = (a: Ativo) => a.market_hash_name === p.nome && String(a.appid) === p.appid;
  // O anúncio tem de existir e ser deste item (id e nome vêm do DOM da página, que pode estar desalinhado).
  try {
    if ((await d.anuncio(p.listingId)) !== `${p.appid}:${p.nome}`) return { ok: false, motivo: tx().relistarFalha(tx().relistarNaoConfere) };
  } catch (e) {
    return { ok: false, motivo: tx().relistarFalha(msg(e)) };
  }
  // Cópias do mesmo item que já estavam no inventário: nunca são listadas (só a que voltar do anúncio removido).
  // Isso também cobre a remoção que a Steam aceita sem efeito (anúncio já vendido): nada novo volta, nada é listado.
  let antes: Set<string>;
  try {
    antes = new Set((await d.inventario()).filter(mesmoItem).map((a) => a.assetid));
  } catch (e) {
    return { ok: false, motivo: tx().relistarFalha(msg(e)) };
  }
  try {
    await d.remover(p.listingId);
  } catch (e) {
    return { ok: false, motivo: tx().relistarFalha(msg(e)) };
  }
  let item: Ativo | undefined;
  /** o anúncio já não aparece em mylistings (removido ou vendido) */
  let sumiu = false;
  for (let i = 0; i < TENTATIVAS_INVENTARIO && !item; i++) {
    await d.esperar(ESPERA_MS);
    try {
      // só depois que o anúncio sumiu: uma cópia nova antes disso não veio dele (troca, compra, outra aba)
      if (!sumiu && (await d.anuncio(p.listingId)) !== null) continue;
      sumiu = true;
      item = (await d.inventario()).find((a) => a.marketable && mesmoItem(a) && !antes.has(a.assetid));
    } catch {
      /* 429/erro numa tentativa: tenta de novo na próxima */
    }
  }
  // anúncio saiu mas a cópia não voltou a tempo: removido (o item aparece no inventário). Se não saiu, nada mudou.
  if (!item) return sumiu ? { ok: false, motivo: tx().relistarSemItem, removido: true } : { ok: false, motivo: tx().relistarSemItem };
  try {
    const r = await d.vender(item, liquido);
    if (!r.ok) return { ok: false, motivo: tx().relistarRecusado(r.motivo), removido: true };
    return { ok: true, precisaConfirmar: r.precisaConfirmar };
  } catch (e) {
    return { ok: false, motivo: tx().relistarRecusado(msg(e)), removido: true };
  }
}
