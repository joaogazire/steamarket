/** Total sugerido do inventário: soma dos preços sugeridos (o que o comprador paga) e do que você recebe. */
export interface Total {
  /** soma dos preços sugeridos, em centavos */
  bruto: number;
  /** soma do que chega na carteira depois das taxas, em centavos */
  liquido: number;
  /** itens com preço sugerido */
  comPreco: number;
  /** itens à venda considerados (com ou sem preço) */
  itens: number;
}

export function somarTotal(precos: (number | null)[], liquido: (c: number) => number): Total {
  const t: Total = { bruto: 0, liquido: 0, comPreco: 0, itens: precos.length };
  for (const p of precos) {
    if (p === null) continue;
    t.bruto += p;
    t.comPreco++;
    try {
      t.liquido += liquido(p);
    } catch {
      /* preço que a Steam não aceitaria: não soma no líquido */
    }
  }
  return t;
}

/** Centavos → "R$ 1.234,56". */
export function reais(c: number): string {
  const [int, dec] = (Math.round(c) / 100).toFixed(2).split(".") as [string, string];
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}
