/**
 * Preços de todos os itens do CS2 num pedido só: a mesma fonte do cs2trader (prices.csgotrader.app).
 * Valores em USD (média das vendas no mercado da Steam) e câmbio do dia. Pedido público, sem cookies.
 * Serve só de estimativa rápida para a grade; antes de listar, a extensão confere o mercado na Steam.
 */
import { ErroFormato, ErroRede } from "../steam/cliente.ts";

export const URL_PRECOS = "https://prices.csgotrader.app/latest/steam.json";
export const URL_TAXAS = "https://prices.csgotrader.app/latest/exchange_rates.json";
/** Só o CS2 tem tabela nessa fonte. */
export const APP_COM_TABELA = "730";
/** Teto de sanidade (R$ 100.000,00), igual ao da venda. */
const MAX_CENTAVOS = 10_000_000;

export interface TabelaMassa {
  precos: Record<string, unknown>;
  taxas: Record<string, unknown>;
}

// ECurrencyCode da Steam → ISO 4217.
const MOEDAS: Record<number, string> = {
  1: "USD", 2: "GBP", 3: "EUR", 4: "CHF", 5: "RUB", 6: "PLN", 7: "BRL", 8: "JPY", 9: "NOK", 10: "IDR",
  11: "MYR", 12: "PHP", 13: "SGD", 14: "THB", 15: "VND", 16: "KRW", 17: "TRY", 18: "UAH", 19: "MXN", 20: "CAD",
  21: "AUD", 22: "NZD", 23: "CNY", 24: "INR", 25: "CLP", 26: "PEN", 27: "COP", 28: "ZAR", 29: "HKD", 30: "TWD",
  31: "SAR", 32: "AED", 34: "ARS", 35: "ILS", 37: "KZT", 38: "KWD", 39: "QAR", 40: "CRC", 41: "UYU",
};

export const moedaIso = (codigo: number): string | null => (Object.hasOwn(MOEDAS, codigo) ? (MOEDAS[codigo] as string) : null);

const positivo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** Média de 7 dias; sem ela, 24 h, 30 d e 90 d. */
export function precoUsd(item: unknown): number | null {
  if (!item || typeof item !== "object") return null;
  const x = item as Record<string, unknown>;
  return positivo(x.last_7d) ?? positivo(x.last_24h) ?? positivo(x.last_30d) ?? positivo(x.last_90d);
}

export function centavosPara(nomes: string[], tabela: TabelaMassa, moeda: number): Record<string, number> {
  const iso = moedaIso(moeda);
  const taxa = iso && Object.hasOwn(tabela.taxas, iso) ? positivo(tabela.taxas[iso]) : null;
  const saida: Record<string, number> = {};
  if (taxa === null) return saida;
  for (const nome of nomes) {
    if (!Object.hasOwn(tabela.precos, nome)) continue;
    const usd = precoUsd(tabela.precos[nome]);
    if (usd === null) continue;
    const c = Math.round(usd * taxa * 100);
    if (Number.isSafeInteger(c) && c >= 1 && c <= MAX_CENTAVOS) saida[nome] = c;
  }
  return saida;
}

async function baixar(f: typeof fetch, url: string): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await f(url, { credentials: "omit" });
  } catch (e) {
    throw new ErroRede(e instanceof Error ? e.message : String(e));
  }
  if (!r.ok) throw new ErroFormato(`status ${r.status} em ${new URL(url).host}`);
  let v: unknown;
  try {
    v = await r.json();
  } catch {
    throw new ErroFormato(`corpo inválido em ${new URL(url).host}`);
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ErroFormato(`corpo inválido em ${new URL(url).host}`);
  return v as Record<string, unknown>;
}

export async function baixarTabela(f: typeof fetch): Promise<TabelaMassa> {
  const [precos, taxas] = await Promise.all([baixar(f, URL_PRECOS), baixar(f, URL_TAXAS)]);
  return { precos, taxas };
}
