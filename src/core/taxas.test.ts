import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comprador, liquido, menorTotal } from "./taxas.ts";
import { REGRA_PADRAO } from "./tipos.ts";

// Oráculo: o JS público da Steam (fixtures/referencia), executado como está.
const wallet = {
  wallet_market_minimum: 1,
  wallet_currency_increment: 1,
  wallet_fee_percent: 0.05,
  wallet_publisher_fee_percent_default: 0.1,
};
const fonte = readFileSync("fixtures/referencia/economy_common.taxas.js", "utf8");
const steam = new Function(`${fonte}; return { GetTotalWithFees, GetItemPriceFromTotal };`)() as {
  GetTotalWithFees(b: number, p: number, s: number, w: typeof wallet): number;
  GetItemPriceFromTotal(t: number, w: typeof wallet): number;
};

describe("comprador (líquido -> preço pago pelo comprador) FEE-02", () => {
  it("valores conferidos à mão", () => {
    expect(comprador(100, REGRA_PADRAO)).toBe(115); // 100 + 10 + 5
    expect(comprador(1000, REGRA_PADRAO)).toBe(1150);
    expect(comprador(10, REGRA_PADRAO)).toBe(12); // 10 + 1 + mínimo 1
    expect(comprador(1, REGRA_PADRAO)).toBe(3); // 1 + 1 + 1 (mínimo de cada taxa)
    expect(comprador(25, REGRA_PADRAO)).toBe(28); // 25 + floor(2.5)=2 + floor(1.25)=1
  });
  it("igual ao JS da Steam de 1 a 10000 centavos", () => {
    for (let base = 1; base <= 10000; base++) {
      expect(comprador(base, REGRA_PADRAO), `base ${base}`).toBe(steam.GetTotalWithFees(base, 0.1, 0.05, wallet));
    }
  });
});

describe("liquido (preço do comprador -> líquido) FEE-01", () => {
  it("valores conferidos à mão", () => {
    expect(liquido(115, REGRA_PADRAO)).toBe(100);
    expect(liquido(1150, REGRA_PADRAO)).toBe(1000);
    expect(liquido(3, REGRA_PADRAO)).toBe(1);
  });
  it("igual ao JS da Steam para totais de 3 a 11500", () => {
    for (let total = 3; total <= 11500; total++) {
      expect(liquido(total, REGRA_PADRAO), `total ${total}`).toBe(steam.GetItemPriceFromTotal(total, wallet));
    }
  });
});

describe("FEE-03 centavos inteiros", () => {
  it("devolve sempre inteiros", () => {
    for (const x of [1, 7, 33, 199, 4321]) {
      expect(Number.isInteger(comprador(x, REGRA_PADRAO))).toBe(true);
      expect(Number.isInteger(liquido(x + 2, REGRA_PADRAO))).toBe(true);
    }
  });
  it("lança erro para preço não inteiro ou não positivo", () => {
    expect(() => comprador(1.5, REGRA_PADRAO)).toThrow();
    expect(() => comprador(0, REGRA_PADRAO)).toThrow();
    expect(() => liquido(-5, REGRA_PADRAO)).toThrow();
  });
});

// Achados de segurança: entrada fora do intervalo seguro e regra de taxa vinda da Steam.
describe("robustez das taxas", () => {
  it("recusa valores acima do intervalo seguro", () => {
    expect(() => comprador(1e300, REGRA_PADRAO)).toThrow();
    expect(() => liquido(2 ** 53, REGRA_PADRAO)).toThrow();
  });
  it("recusa total abaixo do mínimo possível (1 de líquido custa 3)", () => {
    expect(() => liquido(2, REGRA_PADRAO)).toThrow("abaixo do mínimo");
    // a mensagem traz os números, para achar a causa quando a carteira vem com outro mínimo
    expect(() => liquido(17, { ...REGRA_PADRAO, minimo: 20 })).toThrow("total 17 abaixo do mínimo 60 (centavos; mínimo da carteira 20)");
  });
  it("recusa regra de taxa inválida", () => {
    expect(() => comprador(100, { ...REGRA_PADRAO, taxaJogo: NaN })).toThrow("regra");
    expect(() => comprador(100, { ...REGRA_PADRAO, incremento: 0 })).toThrow("regra");
    expect(() => comprador(100, { ...REGRA_PADRAO, taxaSteam: 1.5 })).toThrow("regra");
  });
  it("o líquido devolvido sempre fecha com o total (para totais viáveis)", () => {
    for (let total = 3; total <= 3000; total++) {
      expect(comprador(liquido(total, REGRA_PADRAO), REGRA_PADRAO)).toBeLessThanOrEqual(total);
    }
  });
});

describe("menorTotal (menor preço que a Steam aceita listar)", () => {
  it("é o mínimo da carteira mais as duas taxas mínimas", () => {
    expect(menorTotal(REGRA_PADRAO)).toBe(3);
    // BRL: mínimo 6 → R$ 0,18, igual ao "Starting at" de itens baratos (captura 13/11/2026)
    expect(menorTotal({ ...REGRA_PADRAO, minimo: 6 })).toBe(18);
  });
});
