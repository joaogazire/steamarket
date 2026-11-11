// Captura respostas reais da Steam para virar fixtures (Fase 0).
// Uso: read -rs STEAM_COOKIE; export STEAM_COOKIE; node scripts/capturar.ts <steamid64> <appid> <contextid>; unset STEAM_COOKIE
// Os cookies vêm só do ambiente e nunca são gravados. As saídas vão para fixtures/privado/ (ignorado pelo git).
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function temSessao(cookie: string | undefined): boolean {
  if (!cookie) return false;
  return /(^|;\s*)steamLoginSecure=[^;]+/.test(cookie) && /(^|;\s*)sessionid=[^;]+/.test(cookie);
}

export function exigirSessao(cookie: string | undefined): string {
  if (!temSessao(cookie)) throw new Error("sessão Steam ausente");
  return cookie as string;
}

export function validarArgs(steamid?: string, appid?: string, contextid?: string): { steamid: string; appid: string; contextid: string } {
  if (!steamid || !appid || !contextid || !/^\d{17}$/.test(steamid) || !/^\d{1,7}$/.test(appid) || !/^\d{1,3}$/.test(contextid)) {
    throw new Error("argumentos inválidos (uso: capturar.ts <steamid64> <appid> <contextid>)");
  }
  return { steamid, appid, contextid };
}

const PAUSA_MS = 4000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pegar(url: string, cookie: string, log: string[]): Promise<{ status: number; corpo: string }> {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { cookie, "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0" } });
  if (r.status === 429) throw new Error("429 da Steam: parei para não arriscar bloqueio; espere alguns minutos");
  const corpo = await r.text();
  log.push(`${new Date().toISOString()} ${r.status} ${Date.now() - t0}ms ${url.replace(/\/inventory\/\d+/, "/inventory/<steamid>").replace(/market_hash_name=[^&]*/, "market_hash_name=<item>").replace(/listings\/(\d+)\/[^?]*/, "listings/$1/<item>")}`);
  await dormir(PAUSA_MS);
  return { status: r.status, corpo };
}

function salvar(caminho: string, r: { status: number; corpo: string }, log: string[]): void {
  if (r.status !== 200) {
    log.push(`não salvo (${r.status}): ${caminho}`);
    return;
  }
  writeFileSync(caminho, r.corpo, { mode: 0o600 });
}

async function principal(): Promise<void> {
  const { steamid, appid, contextid } = validarArgs(...(process.argv.slice(2, 5) as [string?, string?, string?]));
  const cookie = exigirSessao(process.env.STEAM_COOKIE);
  const dir = "fixtures/privado";
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const log: string[] = [];

  const inv = await pegar(`https://steamcommunity.com/inventory/${steamid}/${appid}/${contextid}?l=english&count=2000`, cookie, log);
  if (inv.status !== 200) throw new Error(`inventário respondeu ${inv.status}; nada foi salvo`);
  writeFileSync(`${dir}/inventario.json`, inv.corpo, { mode: 0o600 });
  let dados: { descriptions?: ({ market_hash_name?: unknown; marketable?: unknown } | null)[] };
  try {
    dados = JSON.parse(inv.corpo);
  } catch {
    throw new Error("resposta do inventário não é JSON (sessão expirada?)");
  }
  const nomes = [
    ...new Set(
      (dados.descriptions ?? [])
        .filter((d) => d?.marketable === 1 && typeof d.market_hash_name === "string")
        .map((d) => d?.market_hash_name as string),
    ),
  ].slice(0, 3);

  for (const [i, nome] of nomes.entries()) {
    const q = encodeURIComponent(nome);
    const hist = await pegar(`https://steamcommunity.com/market/pricehistory/?appid=${appid}&market_hash_name=${q}`, cookie, log);
    salvar(`${dir}/pricehistory-${i}.json`, hist, log);
    const vis = await pegar(`https://steamcommunity.com/market/priceoverview/?appid=${appid}&currency=7&market_hash_name=${q}`, cookie, log);
    salvar(`${dir}/priceoverview-${i}.json`, vis, log);
    const pag = await pegar(`https://steamcommunity.com/market/listings/${appid}/${q}`, cookie, log);
    const nameid = /Market_LoadOrderSpread\(\s*(\d+)\s*\)/.exec(pag.corpo)?.[1];
    if (nameid) {
      const ord = await pegar(`https://steamcommunity.com/market/itemordershistogram?country=BR&language=english&currency=7&item_nameid=${nameid}`, cookie, log);
      salvar(`${dir}/ordens-${i}.json`, ord, log);
    } else {
      log.push(`sem item_nameid para ${nome}`);
    }
  }
  writeFileSync(`${dir}/captura.log`, log.join("\n") + "\n", { mode: 0o600 });
  console.log(`ok: ${nomes.length} itens, log em ${dir}/captura.log`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
