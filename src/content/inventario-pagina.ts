/**
 * Lê o inventário que a própria página da Steam já carregou (g_ActiveInventory), sem pedir de novo.
 * Formato tirado de economy_v2.js: CInventory.m_rgAssets (assetid → asset com description) e,
 * no CS2, CAppwideInventory.m_rgChildInventories (um CInventory por contexto, ex.: 2 e 16).
 * Tudo que vem da página é copiado para objetos simples e validado.
 */
import type { Ativo } from "../core/tipos.ts";

export interface AtivoPagina extends Ativo {
  /** item à venda no mercado (a Steam marca com sealed + sealed_type 1, "On Market") */
  listado: boolean;
}

export interface LeituraPagina {
  ativos: AtivoPagina[];
  completo: boolean;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);
const MAX_ATIVOS = 30_000;

function lerUm(inv: Obj, saida: AtivoPagina[]): boolean {
  const rg = obj(inv.m_rgAssets);
  if (!rg) return false;
  const appidInv = Number(inv.appid ?? inv.m_appid);
  const contextInv = String(inv.contextid ?? inv.m_contextid ?? "");
  for (const chave of Object.keys(rg)) {
    if (saida.length >= MAX_ATIVOS) break;
    const a = obj(rg[chave]);
    const d = obj(a?.description);
    if (!a || !d) continue;
    const assetid = String(a.assetid ?? "");
    const appid = Number(a.appid ?? appidInv);
    const contextid = String(a.contextid ?? contextInv);
    const nome = d.market_hash_name;
    if (!/^\d{1,20}$/.test(assetid) || !Number.isInteger(appid) || appid <= 0 || !/^\d{1,3}$/.test(contextid)) continue;
    if (typeof nome !== "string" || nome.length === 0 || nome.length > 300) continue;
    saida.push({
      assetid,
      appid,
      contextid,
      market_hash_name: nome,
      marketable: d.marketable === 1 || d.marketable === true,
      listado: Boolean(d.sealed) && Number(d.sealed_type) === 1,
    });
  }
  return inv.m_bFullyLoaded === true;
}

export function lerInventarioDaPagina(inventario: unknown): LeituraPagina | null {
  const inv = obj(inventario);
  if (!inv) return null;
  const ativos: AtivoPagina[] = [];
  const filhos = obj(inv.m_rgChildInventories);
  if (filhos) {
    let completo = true;
    let algum = false;
    for (const k of Object.keys(filhos)) {
      const filho = obj(filhos[k]);
      if (!filho || !obj(filho.m_rgAssets)) continue;
      algum = true;
      if (!lerUm(filho, ativos)) completo = false;
    }
    return algum ? { ativos, completo } : null;
  }
  if (!obj(inv.m_rgAssets)) return null;
  return { completo: lerUm(inv, ativos), ativos };
}

export interface OpcoesEspera {
  dormir?: (ms: number) => Promise<void>;
  intervaloMs?: number;
  tentativas?: number;
}

/**
 * Pede à página para carregar o inventário inteiro (a própria Steam faz os pedidos, que dão 200)
 * e espera até ficar completo. Devolve a última leitura, mesmo incompleta, ou null se nada apareceu.
 */
export async function esperarInventarioDaPagina(obter: () => unknown, appid: string, op: OpcoesEspera = {}): Promise<LeituraPagina | null> {
  const dormir = op.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const intervalo = op.intervaloMs ?? 500;
  const tentativas = op.tentativas ?? 60;
  let pediu = false;
  let ultima: LeituraPagina | null = null;
  for (let i = 0; i < tentativas; i++) {
    const inv = obj(obter());
    if (inv && String(inv.appid ?? inv.m_appid) === appid) {
      if (!pediu && typeof inv.LoadCompleteInventory === "function") {
        pediu = true;
        try {
          (inv.LoadCompleteInventory as () => unknown).call(inv);
        } catch {
          /* a página carrega sozinha de qualquer jeito; só fica mais lento */
        }
      }
      ultima = lerInventarioDaPagina(inv) ?? ultima;
      if (ultima?.completo) return ultima;
    }
    if (i < tentativas - 1) await dormir(intervalo);
  }
  return ultima;
}
