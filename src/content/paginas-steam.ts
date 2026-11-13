/**
 * A grade da Steam cria cada página (CPage) só quando o usuário chega nela, e só carrega as imagens
 * das páginas por onde passou. Para mandar os listados ao fim já ao ligar "Ocultar listados",
 * pedimos à Steam todas as páginas (as funções dela, pelo g_ActiveInventory) e, depois de reordenar,
 * as imagens de novo. Erros da página não escapam: no pior caso, a ordem fica como estava.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);

function paginas(inv: unknown): Obj[] {
  const lista = obj(obj(inv)?.m_rgPages);
  if (!lista) return [];
  const n = Number(lista.length);
  const saida: Obj[] = [];
  for (let i = 0; Number.isInteger(n) && i < Math.min(n, 1000); i++) {
    const p = obj(lista[i]);
    if (p) saida.push(p);
  }
  return saida;
}

/** Cria (pela Steam) as páginas que ainda não existem; devolve quantas responderam. */
export function criarTodasPaginas(inv: unknown): number {
  let feitas = 0;
  for (const p of paginas(inv)) {
    if (typeof p.GetElement !== "function") continue;
    try {
      (p.GetElement as () => unknown).call(p);
      feitas++;
    } catch {
      /* página com problema: segue para as outras */
    }
  }
  return feitas;
}

/** Itens que trocaram de página precisam da imagem: a Steam recarrega a página atual e as vizinhas. */
export function recarregarImagens(inv: unknown): void {
  const o = obj(inv);
  if (!o) return;
  for (const p of paginas(o)) p.m_bImagesLoaded = false;
  try {
    if (typeof o.PreloadPageImages === "function") (o.PreloadPageImages as (i: unknown) => unknown).call(o, o.m_iCurrentPage);
  } catch {
    /* sem imagens novas; a Steam carrega ao trocar de página */
  }
}
