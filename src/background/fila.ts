/** Uma requisição por vez, pausa mínima entre elas e recuo exponencial em 429 (PRC-03, PRC-04, SEL-04). */

export class ErroLimite extends Error {
  constructor() {
    super("limite de requisições da Steam (429)");
    this.name = "ErroLimite";
  }
}

export class ErroCancelado extends Error {
  constructor() {
    super("tarefa cancelada");
    this.name = "ErroCancelado";
  }
}

export interface OpcoesFila {
  pausaMs?: number;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  /** chamado com a espera (ms) sempre que a fila pausa por causa de um 429 */
  aoPausar?: (ms: number) => void;
}

export interface Fila {
  enfileirar<T>(tarefa: () => Promise<T>, grupoId?: string): Promise<T>;
  cancelar(grupoId: string): void;
}

const RECUO_MAX_MS = 60_000;
const RETENTATIVAS_429 = 8;
const MAX_NA_FILA = 200;

interface Item {
  tarefa: () => Promise<unknown>;
  grupoId: string | undefined;
  ok: (v: unknown) => void;
  falha: (e: unknown) => void;
}

export function criarFila(op: OpcoesFila = {}): Fila {
  const pausaMs = op.pausaMs ?? 3000;
  const agora = op.agora ?? Date.now;
  const dormir = op.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pendentes: Item[] = [];
  let rodando = false;
  let ultimoFim = Number.NEGATIVE_INFINITY;

  async function executar(item: Item): Promise<void> {
    let recuo = pausaMs;
    for (let tentativa = 0; ; tentativa++) {
      const espera = pausaMs - (agora() - ultimoFim);
      if (espera > 0) await dormir(espera);
      try {
        const v = await item.tarefa();
        ultimoFim = agora();
        item.ok(v);
        return;
      } catch (e) {
        ultimoFim = agora();
        if (!(e instanceof ErroLimite) || tentativa >= RETENTATIVAS_429) {
          item.falha(e);
          return;
        }
        op.aoPausar?.(recuo);
        await dormir(recuo);
        recuo = Math.min(recuo * 2, RECUO_MAX_MS);
      }
    }
  }

  async function drenar(): Promise<void> {
    if (rodando) return;
    rodando = true;
    try {
      for (let item = pendentes.shift(); item; item = pendentes.shift()) await executar(item);
    } finally {
      rodando = false;
    }
  }

  return {
    enfileirar<T>(tarefa: () => Promise<T>, grupoId?: string): Promise<T> {
      if (pendentes.length + (rodando ? 1 : 0) >= MAX_NA_FILA) return Promise.reject(new ErroLimite());
      return new Promise<T>((ok, falha) => {
        pendentes.push({ tarefa, grupoId, ok: ok as (v: unknown) => void, falha });
        void drenar();
      });
    },
    cancelar(grupoId: string): void {
      for (let i = pendentes.length - 1; i >= 0; i--) {
        const item = pendentes[i] as Item;
        if (item.grupoId === grupoId) {
          pendentes.splice(i, 1);
          item.falha(new ErroCancelado());
        }
      }
    },
  };
}
