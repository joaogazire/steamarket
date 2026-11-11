/** Recebe mensagens do painel, passa pela fila e pelo cache e responde (PRC-01, PRC-02, PRC-03). */
import type { Ativo, Ponto } from "../core/tipos.ts";
import { ErroFormato, ErroRede, ErroSessao, type Ordens, type VisaoGeral } from "../steam/cliente.ts";
import type { Cache } from "./cache.ts";
import { ErroCancelado, ErroLimite, type Fila } from "./fila.ts";

export interface Steam {
  inventario(steamid: string, appid: string, contextid: string): Promise<Ativo[]>;
  historico(appid: string, nome: string): Promise<Ponto[]>;
  visaoGeral(appid: string, nome: string, moeda: number): Promise<VisaoGeral>;
  ordens(nameId: string, moeda: number, pais: string): Promise<Ordens>;
  itemNameId(appid: string, nome: string): Promise<string>;
}

export type Mensagem =
  | { tipo: "preco"; appid: string; nome: string; moeda: number; pais: string; grupoId: string }
  | { tipo: "inventario"; steamid: string; appid: string; contextid: string; grupoId: string }
  | { tipo: "cancelar"; grupoId: string };

export interface DadosPreco {
  visao: VisaoGeral;
  ordens: Ordens;
  historico: Ponto[];
}

export type Resposta =
  | { ok: true; dados: DadosPreco | Ativo[] | null }
  | { ok: false; erro: "sessao" | "limite" | "formato" | "rede" | "cancelado" | "interno"; mensagem: string };

export interface Dependencias {
  fila: Pick<Fila, "enfileirar" | "cancelar">;
  cache: Cache;
  steam: Steam;
}

const HORA = 3_600_000;
const CINCO_MIN = 300_000;

function validar(m: unknown): Mensagem | null {
  if (!m || typeof m !== "object") return null;
  const x = m as Record<string, unknown>;
  const grupoOk = typeof x.grupoId === "string" && x.grupoId.length > 0 && x.grupoId.length <= 100;
  if (x.tipo === "cancelar" && grupoOk) return { tipo: "cancelar", grupoId: x.grupoId as string };
  if (
    x.tipo === "inventario" &&
    grupoOk &&
    typeof x.steamid === "string" && /^\d{17}$/.test(x.steamid) &&
    typeof x.appid === "string" && /^\d{1,7}$/.test(x.appid) &&
    typeof x.contextid === "string" && /^\d{1,3}$/.test(x.contextid)
  ) {
    return x as unknown as Mensagem;
  }
  if (
    x.tipo === "preco" &&
    grupoOk &&
    typeof x.appid === "string" && /^\d{1,7}$/.test(x.appid) &&
    typeof x.nome === "string" && x.nome.length > 0 && x.nome.length <= 300 &&
    typeof x.moeda === "number" && Number.isInteger(x.moeda) && x.moeda > 0 &&
    typeof x.pais === "string" && /^[A-Z]{2}$/.test(x.pais)
  ) {
    return x as unknown as Mensagem;
  }
  return null;
}

function paraResposta(e: unknown): Resposta {
  if (e instanceof ErroSessao) return { ok: false, erro: "sessao", mensagem: "entre na Steam e recarregue" };
  if (e instanceof ErroLimite) return { ok: false, erro: "limite", mensagem: "aguardando limite da Steam" };
  if (e instanceof ErroFormato) return { ok: false, erro: "formato", mensagem: "resposta inesperada da Steam" };
  if (e instanceof ErroRede) return { ok: false, erro: "rede", mensagem: "falha de rede, tentar de novo" };
  if (e instanceof ErroCancelado) return { ok: false, erro: "cancelado", mensagem: "cancelado" };
  return { ok: false, erro: "interno", mensagem: "erro inesperado" };
}

export function criarRoteador({ fila, cache, steam }: Dependencias) {
  async function via<T>(
    chave: string,
    ttlMs: number,
    grupoId: string,
    buscar: () => Promise<T>,
    valido: (v: unknown) => boolean = () => true,
  ): Promise<T> {
    const guardado = await cache.obter<T>(chave, ttlMs);
    if (guardado !== undefined && valido(guardado)) return guardado;
    const valor = await fila.enfileirar(buscar, grupoId);
    if (!valido(valor)) throw new ErroFormato(`valor fora do formato (${chave.split(":")[0]})`);
    await cache.guardar(chave, valor);
    return valor;
  }

  return {
    async tratar(entrada: unknown): Promise<Resposta> {
      const m = validar(entrada);
      if (!m) return { ok: false, erro: "formato", mensagem: "resposta inesperada da Steam" };
      if (m.tipo === "cancelar") {
        fila.cancelar(m.grupoId);
        return { ok: true, dados: null };
      }
      try {
        if (m.tipo === "inventario") {
          const ativos = await fila.enfileirar(() => steam.inventario(m.steamid, m.appid, m.contextid), m.grupoId);
          return { ok: true, dados: ativos };
        }
        const nameId = await via(
          `nameid:${m.appid}:${m.nome}`,
          Infinity,
          m.grupoId,
          () => steam.itemNameId(m.appid, m.nome),
          (v) => typeof v === "string" && /^\d{1,15}$/.test(v),
        );
        const visao = await via(`vis:${m.appid}:${m.moeda}:${m.nome}`, CINCO_MIN, m.grupoId, () => steam.visaoGeral(m.appid, m.nome, m.moeda));
        const historico = await via(`hist:${m.appid}:${m.nome}`, HORA, m.grupoId, () => steam.historico(m.appid, m.nome));
        const ordens = await via(`ord:${m.pais}:${m.moeda}:${nameId}`, CINCO_MIN, m.grupoId, () => steam.ordens(nameId, m.moeda, m.pais));
        return { ok: true, dados: { visao, ordens, historico } };
      } catch (e) {
        return paraResposta(e);
      }
    },
  };
}
