import type { RegraTaxa } from "./tipos.ts";

// Porte fiel de fixtures/referencia/economy_common.taxas.js (JS público da Steam).

const MAX_CENTAVOS = 1_000_000_000;

function exigirCentavos(v: number): void {
  if (!Number.isSafeInteger(v) || v <= 0 || v > MAX_CENTAVOS) throw new Error(`preço inválido: ${v}`);
}

// A regra vem do wallet info da Steam, que não é confiável.
function exigirRegra(r: RegraTaxa): void {
  const taxaOk = (t: number) => Number.isFinite(t) && t >= 0 && t < 1;
  const inteiroOk = (n: number) => Number.isSafeInteger(n) && n >= 1;
  if (!taxaOk(r.taxaSteam) || !taxaOk(r.taxaJogo) || !inteiroOk(r.minimo) || !inteiroOk(r.incremento)) {
    throw new Error("regra de taxa inválida");
  }
}

function precoValido(preco: number, r: RegraTaxa): number {
  if (preco <= r.minimo) return r.minimo;
  if (preco <= r.incremento) return r.incremento;
  if (r.incremento > 1) {
    const q = preco / r.incremento;
    const sinal = q < 0 ? -1 : 1;
    return sinal * Math.floor(Math.abs(q) + 0.5) * r.incremento;
  }
  return preco;
}

function taxa(base: number, pct: number, r: RegraTaxa): number {
  return pct > 0 ? precoValido(Math.floor(base * pct), r) : 0;
}

function totalComTaxas(base: number, r: RegraTaxa): number {
  return precoValido(base, r) + taxa(base, r.taxaJogo, r) + taxa(base, r.taxaSteam, r);
}

/** FEE-02: preço que o comprador paga para o vendedor receber `liquidoCentavos`. */
export function comprador(liquidoCentavos: number, r: RegraTaxa): number {
  exigirCentavos(liquidoCentavos);
  exigirRegra(r);
  return totalComTaxas(liquidoCentavos, r);
}

/** Menor preço (o que o comprador paga) que a Steam aceita: mínimo da carteira mais as duas taxas mínimas. */
export function menorTotal(r: RegraTaxa): number {
  exigirRegra(r);
  return totalComTaxas(r.minimo, r);
}

/** FEE-01: quanto o vendedor recebe quando o comprador paga `totalCentavos`. */
export function liquido(totalCentavos: number, r: RegraTaxa): number {
  exigirCentavos(totalCentavos);
  exigirRegra(r);
  const menorTotal = totalComTaxas(r.minimo, r);
  if (totalCentavos < menorTotal) {
    throw new Error(`total ${totalCentavos} abaixo do mínimo ${menorTotal} (centavos; mínimo da carteira ${r.minimo})`);
  }
  const palpite = Math.floor(totalCentavos / (1 + r.taxaJogo + r.taxaSteam));
  const maximo = totalCentavos - 2 * r.minimo;
  let base = precoValido(Math.min(palpite, maximo), r);
  for (let i = 0; i < 3; i++) {
    const calculado = totalComTaxas(base, r);
    if (calculado === totalCentavos) return base;
    if (calculado < totalCentavos) base += r.incremento;
    else {
      base -= r.incremento;
      break;
    }
  }
  return Math.max(r.minimo, base);
}
