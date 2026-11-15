/**
 * Fila única do histórico de preços na página /market: primeiro os anúncios na tela, depois os das outras páginas.
 * Um pedido por vez e nunca o mesmo item duas vezes. No limite da Steam espera e repete o item (não marca "sem histórico").
 */
import type { Resposta } from "../background/roteador.ts";
import type { Ponto } from "../core/tipos.ts";

export interface Pedido {
  appid: string;
  nome: string;
}

export interface DepsCarregador {
  pedir(p: Pedido): Promise<Resposta>;
  esperar(ms: number): Promise<void>;
  /** o item já foi carregado (com ou sem histórico) */
  tem(k: string): boolean;
  /** chaves appid:nome das linhas na tela, na ordem da tela */
  chavesDaPagina(): string[];
  /** chaves de todos os anúncios (todas as páginas) */
  chavesTodas(): string[];
  /** histórico chegou (null = sem histórico ou erro do item) */
  aoCarregar(k: string, h: Ponto[] | null): void;
  /** parou antes do fim: sem sessão ou limite seguido demais */
  aoParar(motivo: "sessao" | "limite"): void;
}

const ESPERA_LIMITE = 60_000;
const MAX_LIMITES_SEGUIDOS = 10;

/** "730:AWP | X" → { appid: "730", nome: "AWP | X" }; null se fora do formato. */
function separar(k: string): Pedido | null {
  const i = k.indexOf(":");
  if (i <= 0) return null;
  const appid = k.slice(0, i);
  const nome = k.slice(i + 1);
  return /^\d{1,7}$/.test(appid) && nome.length > 0 && nome.length <= 300 ? { appid, nome } : null;
}

export function criarCarregador(d: DepsCarregador): { rodar(): Promise<void> } {
  let corrida: Promise<void> | null = null;
  let parado = false;

  const proxima = (): string | undefined => d.chavesDaPagina().find((k) => !d.tem(k)) ?? d.chavesTodas().find((k) => !d.tem(k));

  async function laco(): Promise<void> {
    let limites = 0;
    for (;;) {
      if (parado) return;
      const k = proxima();
      if (k === undefined) return;
      const p = separar(k);
      if (!p) {
        d.aoCarregar(k, null);
        continue;
      }
      const r = await d.pedir(p);
      if (!r.ok && r.erro === "sessao") {
        parado = true;
        d.aoParar("sessao");
        return;
      }
      if (!r.ok && r.erro === "limite") {
        if (++limites >= MAX_LIMITES_SEGUIDOS) {
          d.aoParar("limite");
          return;
        }
        await d.esperar(ESPERA_LIMITE);
        continue;
      }
      limites = 0;
      d.aoCarregar(k, r.ok ? (r.dados as Ponto[]) : null);
    }
  }

  return { rodar: () => (corrida ??= laco().finally(() => (corrida = null))) };
}
