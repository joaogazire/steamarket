/** Ordenação dos anúncios da página /market (todas as páginas, não só a que a Steam mostra). */

export type Direcao = "asc" | "desc";

const MESES = ["jan", "feb|fev", "mar", "apr|abr", "may|mai", "jun", "jul", "aug|ago", "sep|set", "oct|out", "nov", "dec|dez"];

/**
 * Data de "LISTED ON": a Steam mostra só dia e mês ("14 Nov"). Sem ano, vale o ano atual; se a data cair
 * no futuro, é do ano anterior. Devolve o instante (UTC, 00:00) ou null se não for uma data.
 */
export function lerDataListagem(texto: string, agora: number): number | null {
  const m = /^(\d{1,2})\s+([A-Za-zçÇ]{3,})\.?(?:\s+(\d{4}))?$/.exec(texto.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const nomeMes = (m[2] as string).slice(0, 3).toLowerCase();
  const mes = MESES.findIndex((x) => x.split("|").includes(nomeMes));
  if (mes < 0) return null;
  const anoAtual = new Date(agora).getUTCFullYear();
  const valida = (ano: number) => {
    const d = new Date(Date.UTC(ano, mes, dia));
    return d.getUTCMonth() === mes && d.getUTCDate() === dia ? d.getTime() : null;
  };
  if (m[3]) return valida(Number(m[3]));
  const t = valida(anoAtual);
  if (t === null) return null;
  return t > agora + 86_400_000 ? valida(anoAtual - 1) : t;
}

/** Cópia ordenada: empate mantém a ordem de entrada; item sem valor (null) vai sempre para o fim, nas duas direções. */
export function ordenarAnuncios<T>(itens: readonly T[], valor: (t: T) => number | null, dir: Direcao): T[] {
  const com = itens.map((t, i) => ({ t, i, v: valor(t) }));
  const [sem, tem] = [com.filter((x) => x.v === null), com.filter((x) => x.v !== null)];
  tem.sort((a, b) => ((a.v as number) - (b.v as number)) * (dir === "asc" ? 1 : -1) || a.i - b.i);
  return [...tem, ...sem].map((x) => x.t);
}
