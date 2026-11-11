/** Mensagens que o background manda ao painel pela porta (PRC-03 e progresso do lote). */
export interface AcoesPorta {
  avisar(texto: string | null): void;
  progresso(loteId: string, k: number, n: number): void;
}

const MAX_PAUSA_MS = 120_000;

let temporizador: ReturnType<typeof setTimeout> | undefined;

export function tratarPorta(m: unknown, acoes: AcoesPorta): void {
  const x = m as { tipo?: unknown; ms?: unknown; loteId?: unknown; k?: unknown; n?: unknown } | null;
  if (!x) return;
  if (x.tipo === "pausa" && typeof x.ms === "number" && Number.isFinite(x.ms) && x.ms > 0) {
    const ms = Math.min(x.ms, MAX_PAUSA_MS);
    acoes.avisar(`aguardando limite da Steam (${Math.round(ms / 1000)} s)`);
    clearTimeout(temporizador);
    temporizador = setTimeout(() => acoes.avisar(null), ms);
  } else if (
    x.tipo === "progresso" &&
    typeof x.loteId === "string" &&
    x.loteId.length <= 100 &&
    Number.isInteger(x.k) &&
    Number.isInteger(x.n) &&
    (x.k as number) >= 0 &&
    (x.n as number) > 0 &&
    (x.k as number) <= (x.n as number)
  ) {
    acoes.progresso(x.loteId, x.k as number, x.n as number);
  }
}
