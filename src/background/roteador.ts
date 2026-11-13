/** Recebe mensagens do painel, passa pela fila e pelo cache e responde (PRC-01, PRC-02, PRC-03). */
import type { Ativo, Ponto } from "../core/tipos.ts";
import { ErroFormato, ErroRede, ErroSessao, type Ordens, type PaginaAnuncios, type VisaoGeral } from "../steam/cliente.ts";
import type { Cache } from "./cache.ts";
import { APP_COM_TABELA, centavosPara, type TabelaMassa } from "./precos-massa.ts";
import { ErroCancelado, ErroLimite, type Fila } from "./fila.ts";

export interface Steam {
  inventario(steamid: string, appid: string, contextid: string): Promise<Ativo[]>;
  historico(appid: string, nome: string): Promise<Ponto[]>;
  visaoGeral(appid: string, nome: string, moeda: number): Promise<VisaoGeral>;
  ordens(nameId: string, moeda: number, pais: string): Promise<Ordens>;
  itemNameId(appid: string, nome: string): Promise<string>;
  anuncios(appid: string, start: number): Promise<PaginaAnuncios>;
}

export type Mensagem =
  | { tipo: "preco"; appid: string; nome: string; moeda: number; pais: string; grupoId: string }
  | { tipo: "anuncios"; appid: string; grupoId: string }
  | { tipo: "historico"; appid: string; nome: string; grupoId: string }
  | { tipo: "inventario"; steamid: string; appid: string; contextid: string; grupoId: string }
  | { tipo: "precos-massa"; appid: string; nomes: string[]; moeda: number; grupoId: string }
  | { tipo: "cancelar"; grupoId: string };

export interface DadosPreco {
  visao: VisaoGeral;
  ordens: Ordens;
  historico: Ponto[];
}

export type Resposta =
  | { ok: true; dados: DadosPreco | Ativo[] | Ponto[] | Record<string, number | null> | null }
  | { ok: false; erro: "sessao" | "limite" | "formato" | "rede" | "cancelado" | "interno"; mensagem: string };

export interface Dependencias {
  fila: Pick<Fila, "enfileirar" | "cancelar">;
  cache: Cache;
  steam: Steam;
  /** baixa a tabela de preços em massa (CS2); sem ela, precos-massa devolve vazio */
  precosMassa?: () => Promise<TabelaMassa>;
  agora?: () => number;
}

const HORA = 3_600_000;
const CINCO_MIN = 300_000;
const DEZ_MIN = 600_000;
const MAX_PAGINAS_ANUNCIOS = 10;
const SEIS_HORAS = 6 * HORA;
/** Histórico de preços: o preço sugerido e a análise de venda dependem de dados do dia. */
const DOZE_HORAS = 12 * HORA;
/** quanto a tabela fica só na memória antes de reler o IndexedDB (que respeita as 6 h) */
const MEMORIA_TABELA = HORA;
const MAX_NOMES = 5000;

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
  if (x.tipo === "anuncios" && grupoOk && typeof x.appid === "string" && /^\d{1,7}$/.test(x.appid)) {
    return x as unknown as Mensagem;
  }
  if (
    x.tipo === "historico" &&
    grupoOk &&
    typeof x.appid === "string" && /^\d{1,7}$/.test(x.appid) &&
    typeof x.nome === "string" && x.nome.length > 0 && x.nome.length <= 300
  ) {
    return x as unknown as Mensagem;
  }
  if (
    x.tipo === "precos-massa" &&
    grupoOk &&
    typeof x.appid === "string" && /^\d{1,7}$/.test(x.appid) &&
    Array.isArray(x.nomes) && x.nomes.length <= MAX_NOMES &&
    x.nomes.every((n) => typeof n === "string" && n.length > 0 && n.length <= 300) &&
    typeof x.moeda === "number" && Number.isInteger(x.moeda) && x.moeda > 0
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
  if (e instanceof ErroFormato) return { ok: false, erro: "formato", mensagem: e.message };
  if (e instanceof ErroRede) return { ok: false, erro: "rede", mensagem: "falha de rede, tentar de novo" };
  if (e instanceof ErroCancelado) return { ok: false, erro: "cancelado", mensagem: "cancelado" };
  return { ok: false, erro: "interno", mensagem: "erro inesperado" };
}

export function criarRoteador({ fila, cache, steam, precosMassa, agora = Date.now }: Dependencias) {
  // Tabela em massa: memória (o background pode dormir) → IndexedDB → rede; pedidos juntos dividem o download.
  let tabela: { em: number; p: Promise<TabelaMassa> } | null = null;
  function obterTabela(baixar: () => Promise<TabelaMassa>): Promise<TabelaMassa> {
    if (tabela && agora() - tabela.em <= MEMORIA_TABELA) return tabela.p;
    const em = agora();
    const p = (async () => {
      const guardada = await cache.obter<TabelaMassa>("massa:tabela", SEIS_HORAS);
      if (guardada && typeof guardada.precos === "object" && typeof guardada.taxas === "object") return guardada;
      const nova = await baixar();
      await cache.guardar("massa:tabela", nova);
      return nova;
    })();
    tabela = { em, p };
    p.catch(() => {
      if (tabela?.p === p) tabela = null;
    });
    return p;
  }

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
      if (!m) {
        const tipo = (entrada as { tipo?: unknown } | null)?.tipo;
        return { ok: false, erro: "formato", mensagem: `pedido inválido (${typeof tipo === "string" ? tipo.slice(0, 20) : "?"})` };
      }
      if (m.tipo === "cancelar") {
        fila.cancelar(m.grupoId);
        return { ok: true, dados: null };
      }
      try {
        if (m.tipo === "inventario") {
          const ativos = await fila.enfileirar(() => steam.inventario(m.steamid, m.appid, m.contextid), m.grupoId);
          return { ok: true, dados: ativos };
        }
        if (m.tipo === "precos-massa") {
          if (m.appid !== APP_COM_TABELA || !precosMassa) return { ok: true, dados: {} };
          return { ok: true, dados: centavosPara(m.nomes, await obterTabela(precosMassa), m.moeda) };
        }
        if (m.tipo === "anuncios") {
          const itens: Record<string, number | null> = {};
          for (let i = 0; i < MAX_PAGINAS_ANUNCIOS; i++) {
            const inicio = i * 100;
            const pag = await fila.enfileirar(() => steam.anuncios(m.appid, inicio), m.grupoId);
            Object.assign(itens, pag.itens);
            if (inicio + 100 >= pag.total) break;
          }
          return { ok: true, dados: itens };
        }
        const obterHistorico = () => via(`hist:${m.appid}:${m.nome}`, DOZE_HORAS, m.grupoId, () => steam.historico(m.appid, m.nome));
        if (m.tipo === "historico") return { ok: true, dados: await obterHistorico() };
        const visao = await via(`vis:${m.appid}:${m.moeda}:${m.nome}`, CINCO_MIN, m.grupoId, () => steam.visaoGeral(m.appid, m.nome, m.moeda));
        const historico = await obterHistorico();
        // Ordens de compra são opcionais: a página de listagem da Steam nem sempre entrega o item_nameid
        // (302/429 na captura real). Sessão expirada e cancelamento continuam sendo erros.
        let ordens: Ordens = { maiorOrdemCompra: null, menorAnuncio: null };
        const semNameId = `semnameid:${m.appid}:${m.nome}`;
        if ((await cache.obter<boolean>(semNameId, DEZ_MIN)) === undefined) try {
          const nameId = await via(
            `nameid:${m.appid}:${m.nome}`,
            Infinity,
            m.grupoId,
            () => steam.itemNameId(m.appid, m.nome),
            (v) => typeof v === "string" && /^\d{1,15}$/.test(v),
          );
          ordens = await via(`ord:${m.pais}:${m.moeda}:${nameId}`, CINCO_MIN, m.grupoId, () => steam.ordens(nameId, m.moeda, m.pais));
        } catch (e) {
          if (e instanceof ErroSessao || e instanceof ErroCancelado) throw e;
          await cache.guardar(semNameId, true); // não insistir na página de listagem por um tempo
        }
        return { ok: true, dados: { visao, ordens, historico } };
      } catch (e) {
        return paraResposta(e);
      }
    },
  };
}
