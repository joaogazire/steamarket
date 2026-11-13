/** Lê da página do inventário o que a extensão precisa: steamid, sessão, moeda, país e posse. */
import { REGRA_PADRAO, type RegraTaxa } from "../core/tipos.ts";

export interface ContextoPagina {
  steamid: string;
  sessionid: string;
  moeda: number;
  pais: string;
  proprio: boolean;
  regra: RegraTaxa;
}

/** Regra de taxas da carteira; campo ausente usa o padrão, campo inválido derruba tudo para o padrão. */
function lerRegra(c: Record<string, unknown> | undefined): RegraTaxa {
  if (!c) return REGRA_PADRAO;
  const num = (v: unknown, padrao: number): number => (v === undefined ? padrao : Number(v));
  const r: RegraTaxa = {
    taxaSteam: num(c.wallet_fee_percent, REGRA_PADRAO.taxaSteam),
    taxaJogo: num(c.wallet_publisher_fee_percent_default, REGRA_PADRAO.taxaJogo),
    minimo: num(c.wallet_market_minimum, REGRA_PADRAO.minimo),
    incremento: num(c.wallet_currency_increment, REGRA_PADRAO.incremento),
  };
  const taxaOk = (t: number) => Number.isFinite(t) && t >= 0 && t < 1;
  const inteiroOk = (n: number) => Number.isSafeInteger(n) && n >= 1;
  return taxaOk(r.taxaSteam) && taxaOk(r.taxaJogo) && inteiroOk(r.minimo) && inteiroOk(r.incremento) ? r : REGRA_PADRAO;
}

export function lerContexto(w: Record<string, unknown>): ContextoPagina | null {
  const steamid = w.g_steamID;
  const sessionid = w.g_sessionID;
  const carteira = w.g_rgWalletInfo as Record<string, unknown> | undefined;
  const moeda = carteira?.wallet_currency;
  const paisBruto = w.g_strCountryCode ?? "US";
  if (typeof steamid !== "string" || !/^\d{17}$/.test(steamid)) return null;
  if (typeof sessionid !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(sessionid)) return null;
  if (typeof moeda !== "number" || !Number.isInteger(moeda) || moeda <= 0) return null;
  if (typeof paisBruto !== "string" || !/^[A-Z]{2}$/.test(paisBruto)) return null;
  return { steamid, sessionid, moeda, pais: paisBruto, proprio: w.g_bViewingOwnProfile === 1 || w.g_bViewingOwnProfile === true, regra: lerRegra(carteira) };
}

/** O hash da página do inventário é `#appid_contextid` ou só `#appid` (contexto 2; no Steam, 6). */
export function lerAppDoHash(hash: string): { appid: string; contextid: string } | null {
  const m = /^#(\d{1,7})(?:_(\d{1,3}))?$/.exec(hash);
  if (!m) return null;
  const appid = m[1] as string;
  return { appid, contextid: m[2] ?? (appid === "753" ? "6" : "2") };
}

/** App aberto no inventário: pelo hash da URL ou, sem ele, pela aba de jogo ativa da página. */
export function lerAppDaPagina(doc: Document, hash: string): { appid: string; contextid: string } | null {
  const doHash = lerAppDoHash(hash);
  if (doHash) return doHash;
  const aba = doc.querySelector("a.games_list_tab.active[href^='#']");
  return aba ? lerAppDoHash(new URL(aba.getAttribute("href") ?? "", "https://x.invalid/").hash) : null;
}
