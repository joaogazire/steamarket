/** Variação percentual do preço anunciado para a média das últimas vendas. */
export function variacaoPct(preco: number | null, ultimas: number | null): number | null {
  if (preco === null || ultimas === null || !(preco > 0)) return null;
  return ((ultimas - preco) / preco) * 100;
}

/** "+12%", "−37%", "+4,5%": sinal explícito, vírgula decimal, uma casa só abaixo de 10%. */
export function formatarVariacao(v: number): string {
  const abs = Math.abs(v);
  if (abs < 0.05) return "0%";
  const texto = abs < 10 ? abs.toFixed(1).replace(".", ",") : String(Math.round(abs)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "−" : "+"}${texto}%`;
}
