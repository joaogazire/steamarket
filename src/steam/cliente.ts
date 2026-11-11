/** Wrappers dos endpoints da Steam. Só monta a URL, chama e valida o formato; sem DOM nem estado. */
import { ErroLimite } from "../background/fila.ts";
import { parseHistorico } from "../core/historico.ts";
import type { Ativo, Ponto } from "../core/tipos.ts";

export class ErroSessao extends Error {
  constructor() {
    super("sessão Steam ausente ou expirada");
    this.name = "ErroSessao";
  }
}
export class ErroFormato extends Error {
  constructor(detalhe: string) {
    super(`resposta inesperada da Steam: ${detalhe}`);
    this.name = "ErroFormato";
  }
}
export class ErroRede extends Error {
  constructor(detalhe: string) {
    super(`falha de rede: ${detalhe}`);
    this.name = "ErroRede";
  }
}

const BASE = "https://steamcommunity.com";
const MAX_PAGINAS_INVENTARIO = 50;
/** Teto de segurança do preço de venda (R$ 100.000,00): barra erro de unidade ou de moeda. */
const MAX_LIQUIDO_CENTAVOS = 10_000_000;

const ehSteamid = (s: string) => /^\d{17}$/.test(s);
const ehAppid = (s: string) => /^\d{1,7}$/.test(s);
const ehContext = (s: string) => /^\d{1,3}$/.test(s);
const ehNumero = (s: string) => /^\d{1,15}$/.test(s);
function exigir(ok: boolean, o: string): void {
  if (!ok) throw new ErroFormato(`parâmetro inválido (${o})`);
}

/** "R$ 1.234,50" -> 123450; "$4.62" -> 462; sem número -> null. */
export function textoParaCentavos(texto: string | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/[^\d.,]/g, "");
  if (!/\d/.test(limpo)) return null;
  const ult = Math.max(limpo.lastIndexOf("."), limpo.lastIndexOf(","));
  const depois = ult >= 0 ? limpo.slice(ult + 1) : "";
  const decimal = ult >= 0 && depois.length >= 1 && depois.length <= 2;
  const inteiro = (decimal ? limpo.slice(0, ult) : limpo).replace(/[.,]/g, "");
  const centavos = decimal ? depois.padEnd(2, "0") : "00";
  const n = Number.parseInt(`${inteiro || "0"}${centavos}`, 10);
  return Number.isSafeInteger(n) ? n : null;
}

const centavosOuNull = (v: unknown): number | null => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function chamar(f: typeof fetch, url: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await f(url, { credentials: "include", ...init });
  } catch (e) {
    throw new ErroRede(e instanceof Error ? e.message : String(e));
  }
  if (r.status === 429) throw new ErroLimite();
  if (r.status === 401 || r.status === 403) throw new ErroSessao();
  if (r.redirected && /\/login/.test(r.url)) throw new ErroSessao();
  if (!r.ok) throw new ErroFormato(`status ${r.status}`);
  return r;
}

async function json(r: Response): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await r.json();
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* cai no erro abaixo */
  }
  throw new ErroFormato("corpo não é um objeto JSON");
}

const arr = (v: unknown): Record<string, unknown>[] | null => (Array.isArray(v) ? (v as Record<string, unknown>[]) : null);

/** INV-02: todas as páginas do inventário, com cada asset ligado à sua descrição. */
export async function inventario(f: typeof fetch, steamid: string, appid: string, contextid: string): Promise<Ativo[]> {
  exigir(ehSteamid(steamid) && ehAppid(appid) && ehContext(contextid), "inventário");
  const saida: Ativo[] = [];
  let inicio = "";
  for (let pagina = 0; pagina < MAX_PAGINAS_INVENTARIO; pagina++) {
    const url = `${BASE}/inventory/${steamid}/${appid}/${contextid}?l=english&count=2000${inicio ? `&start_assetid=${inicio}` : ""}`;
    const d = await json(await chamar(f, url));
    const assets = arr(d.assets);
    const descs = arr(d.descriptions);
    if (!assets || !descs) {
      if (pagina === 0 && d.total_inventory_count === 0) return [];
      throw new ErroFormato("inventário sem assets/descriptions");
    }
    const porClasse = new Map(descs.map((x) => [`${String(x.classid)}_${String(x.instanceid)}`, x]));
    for (const a of assets) {
      const desc = porClasse.get(`${String(a.classid)}_${String(a.instanceid)}`);
      saida.push({
        assetid: String(a.assetid),
        appid: Number(a.appid),
        contextid: String(a.contextid),
        market_hash_name: typeof desc?.market_hash_name === "string" ? desc.market_hash_name : "",
        marketable: desc?.marketable === 1,
      });
    }
    if (!d.more_items) return saida;
    inicio = String(d.last_assetid ?? "");
    exigir(ehNumero(inicio), "last_assetid");
  }
  throw new ErroFormato("inventário com páginas demais");
}

export async function historico(f: typeof fetch, appid: string, nome: string): Promise<Ponto[]> {
  exigir(ehAppid(appid), "appid");
  const url = `${BASE}/market/pricehistory/?appid=${appid}&market_hash_name=${encodeURIComponent(nome)}`;
  let r: Response;
  try {
    r = await chamar(f, url);
  } catch (e) {
    if (e instanceof ErroFormato && /status 400/.test(e.message)) throw new ErroSessao();
    throw e;
  }
  try {
    return parseHistorico(await json(r));
  } catch (e) {
    if (e instanceof ErroFormato) throw e;
    throw new ErroFormato(e instanceof Error ? e.message : String(e));
  }
}

export interface VisaoGeral {
  menorAnuncio: number | null;
  mediana: number | null;
  volume: number | null;
}

export async function visaoGeral(f: typeof fetch, appid: string, nome: string, moeda: number): Promise<VisaoGeral> {
  exigir(ehAppid(appid) && Number.isInteger(moeda), "visão geral");
  const url = `${BASE}/market/priceoverview/?appid=${appid}&currency=${moeda}&market_hash_name=${encodeURIComponent(nome)}`;
  const d = await json(await chamar(f, url));
  if (d.success !== true && d.success !== 1) throw new ErroFormato("priceoverview sem success");
  const vol = typeof d.volume === "string" ? Number.parseInt(d.volume.replace(/[.,]/g, ""), 10) : NaN;
  return {
    menorAnuncio: textoParaCentavos(d.lowest_price as string | undefined),
    mediana: textoParaCentavos(d.median_price as string | undefined),
    volume: Number.isSafeInteger(vol) ? vol : null,
  };
}

export interface Ordens {
  maiorOrdemCompra: number | null;
  menorAnuncio: number | null;
}

export async function ordens(f: typeof fetch, nameId: string, moeda: number, pais: string): Promise<Ordens> {
  exigir(ehNumero(nameId) && Number.isInteger(moeda) && /^[A-Z]{2}$/.test(pais), "ordens");
  const url = `${BASE}/market/itemordershistogram?country=${pais}&language=english&currency=${moeda}&item_nameid=${nameId}`;
  const d = await json(await chamar(f, url));
  if (d.success !== true && d.success !== 1) throw new ErroFormato("histograma sem success");
  return { maiorOrdemCompra: centavosOuNull(d.highest_buy_order), menorAnuncio: centavosOuNull(d.lowest_sell_order) };
}

export async function itemNameId(f: typeof fetch, appid: string, nome: string): Promise<string> {
  exigir(ehAppid(appid), "appid");
  const r = await chamar(f, `${BASE}/market/listings/${appid}/${encodeURIComponent(nome)}`);
  const id = /Market_LoadOrderSpread\(\s*(\d+)\s*\)/.exec(await r.text())?.[1];
  if (!id) throw new ErroFormato("item_nameid não encontrado na página do item");
  return id;
}

export interface ContextoVenda {
  sessionid: string;
  steamid: string;
}

export type ResultadoVenda = { ok: true; precisaConfirmar: boolean } | { ok: false; motivo: string };

/** `liquidoCentavos` é o que o vendedor recebe (a Steam soma as taxas por cima). */
export async function vender(f: typeof fetch, ctx: ContextoVenda, ativo: Ativo, liquidoCentavos: number): Promise<ResultadoVenda> {
  if (!Number.isSafeInteger(liquidoCentavos) || liquidoCentavos <= 0) throw new Error(`preço inválido: ${liquidoCentavos}`);
  if (liquidoCentavos > MAX_LIQUIDO_CENTAVOS) throw new Error(`preço fora da faixa: ${liquidoCentavos}`);
  exigir(ehSteamid(ctx.steamid) && /^[A-Za-z0-9]{1,64}$/.test(ctx.sessionid), "contexto de venda");
  exigir(ehAppid(String(ativo.appid)) && ehContext(ativo.contextid) && ehNumero(ativo.assetid), "ativo");
  const corpo = new URLSearchParams({
    sessionid: ctx.sessionid,
    appid: String(ativo.appid),
    contextid: ativo.contextid,
    assetid: ativo.assetid,
    amount: "1",
    price: String(liquidoCentavos),
  });
  const r = await chamar(f, `${BASE}/market/sellitem/`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    body: corpo.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${BASE}/profiles/${ctx.steamid}/inventory`,
    },
  });
  const d = await json(r);
  if (d.success === true || d.success === 1) return { ok: true, precisaConfirmar: d.requires_confirmation === 1 || d.requires_confirmation === true };
  return { ok: false, motivo: typeof d.message === "string" && d.message ? d.message : "recusada pela Steam" };
}
