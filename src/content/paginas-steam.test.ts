import { describe, expect, it, vi } from "vitest";
import { criarTodasPaginas, recarregarImagens } from "./paginas-steam.ts";

// A Steam só cria a página da grade (CPage.GetElement) quando o usuário chega nela.
const pagina = () => ({ GetElement: vi.fn(), m_bImagesLoaded: true });

describe("criarTodasPaginas", () => {
  it("pede à Steam cada página da grade", () => {
    const paginas = [pagina(), pagina(), pagina()];
    expect(criarTodasPaginas({ m_rgPages: paginas })).toBe(3);
    for (const p of paginas) expect(p.GetElement).toHaveBeenCalledTimes(1);
  });
  it("ignora o que não parece página e erro de uma página não para as outras", () => {
    const ruim = { GetElement: () => { throw new Error("x"); } };
    const boa = pagina();
    expect(criarTodasPaginas({ m_rgPages: [ruim, null, boa] })).toBe(1);
    expect(boa.GetElement).toHaveBeenCalled();
  });
  it("sem inventário ou sem páginas, não faz nada", () => {
    expect(criarTodasPaginas(null)).toBe(0);
    expect(criarTodasPaginas({})).toBe(0);
  });
});

describe("recarregarImagens", () => {
  it("marca as imagens como não carregadas e pede as da página atual à Steam", () => {
    const paginas = [pagina(), pagina()];
    const PreloadPageImages = vi.fn();
    recarregarImagens({ m_rgPages: paginas, m_iCurrentPage: 1, PreloadPageImages });
    expect(paginas.every((p) => p.m_bImagesLoaded === false)).toBe(true);
    expect(PreloadPageImages).toHaveBeenCalledWith(1);
  });
  it("erro da Steam ao carregar não escapa", () => {
    expect(() => recarregarImagens({ m_rgPages: [], m_iCurrentPage: 0, PreloadPageImages: () => { throw new Error("x"); } })).not.toThrow();
  });
});
