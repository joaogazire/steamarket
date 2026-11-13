import type { Ativo, Grupo } from "./tipos.ts";

/** INV-01 / INV-03: agrupa ativos vendáveis por market_hash_name. */
export function agrupar(ativos: Ativo[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const a of ativos) {
    if (!a.marketable) continue;
    const chave = `${a.appid}|${a.market_hash_name}`;
    const g = mapa.get(chave) ?? { nome: a.market_hash_name, appid: a.appid, ativos: [], contagem: 0 };
    g.ativos.push(a);
    g.contagem = g.ativos.length;
    mapa.set(chave, g);
  }
  return [...mapa.values()].sort((x, y) => y.contagem - x.contagem || x.nome.localeCompare(y.nome));
}

/** Grupos na ordem em que aparecem na grade do inventário (pelo primeiro ativo de cada um). */
export function ordenarPelaGrade(grupos: Grupo[], ativos: Ativo[]): Grupo[] {
  const posicao = new Map<string, number>();
  ativos.forEach((a, i) => posicao.set(a.assetid, i));
  const primeira = (g: Grupo) => Math.min(...g.ativos.map((a) => posicao.get(a.assetid) ?? Infinity));
  return [...grupos].sort((x, y) => primeira(x) - primeira(y));
}
