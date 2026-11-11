/** Regra de taxas da conta/jogo. Percentuais em fração (0.05 = 5%); valores em centavos. */
export interface RegraTaxa {
  taxaSteam: number;
  taxaJogo: number;
  /** wallet_market_minimum */
  minimo: number;
  /** wallet_currency_increment */
  incremento: number;
}

/** Padrões documentados no JS da Steam. A taxa do jogo pode variar; confirmar na captura (fixtures/NOTAS.md). */
export const REGRA_PADRAO: RegraTaxa = { taxaSteam: 0.05, taxaJogo: 0.1, minimo: 1, incremento: 1 };

export interface Ativo {
  assetid: string;
  appid: number;
  contextid: string;
  market_hash_name: string;
  marketable: boolean;
}

export interface Grupo {
  nome: string;
  appid: number;
  ativos: Ativo[];
  contagem: number;
}

/** Ponto do histórico: t em ms (UTC), preço em centavos, volume em unidades. */
export interface Ponto {
  t: number;
  preco: number;
  volume: number;
}

export interface Analise {
  tendenciaPct: number;
  volatilidade: number;
  /** menor anúncio menos maior ordem de compra, em centavos; nulo se faltar um lado */
  spread: number | null;
}
