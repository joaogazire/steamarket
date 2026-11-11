/** Vende N ativos um a um, pelo ritmo da fila (SEL-01..04). */
import type { Ativo } from "../core/tipos.ts";
import { ErroFormato, ErroRede, ErroSessao, type ResultadoVenda } from "../steam/cliente.ts";
import { ErroCancelado, ErroLimite, type Fila } from "./fila.ts";

export interface ResumoLote {
  vendidos: number;
  /** vendas que ainda esperam confirmação no celular (Steam Guard) */
  precisaConfirmar: number;
  recusados: { assetid: string; motivo: string }[];
  cancelado: boolean;
  abortado: null | "sessao" | "limite" | "rede" | "formato";
}

const MAX_ERROS_SEGUIDOS = 3;

export interface DependenciasLote {
  fila: Pick<Fila, "enfileirar" | "cancelar">;
  vender(ativo: Ativo, liquidoCentavos: number): Promise<ResultadoVenda>;
}

export interface Lote {
  cancelar(): void;
  concluido: Promise<ResumoLote>;
}

export function iniciarLote(
  { fila, vender }: DependenciasLote,
  ativos: Ativo[],
  liquidoCentavos: number,
  loteId: string,
  aoProgredir?: (feitos: number, total: number) => void,
): Lote {
  let cancelado = false;
  const resumo: ResumoLote = { vendidos: 0, precisaConfirmar: 0, recusados: [], cancelado: false, abortado: null };

  async function rodar(): Promise<ResumoLote> {
    let feitos = 0;
    let errosSeguidos = 0;
    for (const ativo of ativos) {
      if (cancelado) break;
      try {
        // a checagem fica dentro da tarefa: uma nova tentativa depois de 429 não vende se já cancelaram
        const r = await fila.enfileirar(() => (cancelado ? Promise.reject(new ErroCancelado()) : vender(ativo, liquidoCentavos)), loteId);
        errosSeguidos = 0;
        if (r.ok) {
          resumo.vendidos++;
          if (r.precisaConfirmar) resumo.precisaConfirmar++;
        } else {
          resumo.recusados.push({ assetid: ativo.assetid, motivo: r.motivo });
        }
      } catch (e) {
        if (e instanceof ErroCancelado) break;
        if (e instanceof ErroSessao) { resumo.abortado = "sessao"; break; }
        if (e instanceof ErroLimite) { resumo.abortado = "limite"; break; }
        if (e instanceof ErroRede) { resumo.abortado = "rede"; break; }
        if (e instanceof ErroFormato && ++errosSeguidos >= MAX_ERROS_SEGUIDOS) { resumo.abortado = "formato"; break; }
        resumo.recusados.push({ assetid: ativo.assetid, motivo: e instanceof Error ? e.message : "erro inesperado" });
      }
      feitos++;
      try {
        aoProgredir?.(feitos, ativos.length);
      } catch {
        // a aba do painel pode ter fechado; a venda segue e o resumo é devolvido mesmo assim
      }
    }
    resumo.cancelado = cancelado;
    return resumo;
  }

  return {
    cancelar() {
      cancelado = true;
      fila.cancelar(loteId);
    },
    concluido: rodar(),
  };
}

export interface PedidoLote {
  loteId: string;
  sessionid: string;
  steamid: string;
  liquido: number;
  ativos: Ativo[];
}

const MAX_ATIVOS_LOTE = 500;
const MAX_LIQUIDO = 10_000_000;

/** Valida a mensagem do painel antes de qualquer venda; devolve null se algo estiver fora do formato. */
export function validarPedidoLote(m: unknown): PedidoLote | null {
  if (!m || typeof m !== "object") return null;
  const x = m as Record<string, unknown>;
  if (typeof x.loteId !== "string" || !/^[\w-]{1,100}$/.test(x.loteId)) return null;
  if (typeof x.sessionid !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(x.sessionid)) return null;
  if (typeof x.steamid !== "string" || !/^\d{17}$/.test(x.steamid)) return null;
  if (typeof x.liquido !== "number" || !Number.isSafeInteger(x.liquido) || x.liquido <= 0 || x.liquido > MAX_LIQUIDO) return null;
  if (!Array.isArray(x.ativos) || x.ativos.length === 0 || x.ativos.length > MAX_ATIVOS_LOTE) return null;
  const ativos: Ativo[] = [];
  for (const a of x.ativos as Record<string, unknown>[]) {
    if (!a || typeof a.assetid !== "string" || !/^\d{1,15}$/.test(a.assetid)) return null;
    if (typeof a.appid !== "number" || !Number.isInteger(a.appid) || a.appid <= 0) return null;
    if (typeof a.contextid !== "string" || !/^\d{1,3}$/.test(a.contextid)) return null;
    ativos.push({ assetid: a.assetid, appid: a.appid, contextid: a.contextid, market_hash_name: "", marketable: true });
  }
  return { loteId: x.loteId, sessionid: x.sessionid, steamid: x.steamid, liquido: x.liquido, ativos };
}
