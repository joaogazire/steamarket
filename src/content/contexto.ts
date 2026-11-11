/** Lê da página do inventário o que a extensão precisa: steamid, sessão, moeda, país e posse. */
export interface ContextoPagina {
  steamid: string;
  sessionid: string;
  moeda: number;
  pais: string;
  proprio: boolean;
}

export function lerContexto(w: Record<string, unknown>): ContextoPagina | null {
  const steamid = w.g_steamID;
  const sessionid = w.g_sessionID;
  const carteira = w.g_rgWalletInfo as { wallet_currency?: unknown } | undefined;
  const moeda = carteira?.wallet_currency;
  const paisBruto = w.g_strCountryCode ?? "US";
  if (typeof steamid !== "string" || !/^\d{17}$/.test(steamid)) return null;
  if (typeof sessionid !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(sessionid)) return null;
  if (typeof moeda !== "number" || !Number.isInteger(moeda) || moeda <= 0) return null;
  if (typeof paisBruto !== "string" || !/^[A-Z]{2}$/.test(paisBruto)) return null;
  return { steamid, sessionid, moeda, pais: paisBruto, proprio: w.g_bViewingOwnProfile === 1 };
}

/** O hash da página do inventário é `#appid_contextid`. */
export function lerAppDoHash(hash: string): { appid: string; contextid: string } | null {
  const m = /^#(\d{1,7})_(\d{1,3})$/.exec(hash);
  return m ? { appid: m[1] as string, contextid: m[2] as string } : null;
}
