/** Página de configurações da extensão (popup do ícone e about:addons). */
import { definirIdioma, lerIdioma, tx, type Idioma } from "../core/i18n.ts";
import { renderSeletorIdioma } from "../content/ajustes.ts";

export interface FontesAjustes {
  ler(): Promise<unknown>;
  salvar(i: Idioma): Promise<void>;
  navegador: string | undefined;
}

export async function montarPaginaAjustes(el: HTMLElement, f: FontesAjustes): Promise<void> {
  const doc = el.ownerDocument;
  let salvo: unknown;
  try {
    salvo = await f.ler();
  } catch {
    /* sem storage: segue a língua do navegador */
  }
  definirIdioma(lerIdioma(salvo, f.navegador));
  let atual = lerIdioma(salvo, f.navegador);

  const titulo = doc.createElement("h1");
  const secao = doc.createElement("section");
  const rotulo = doc.createElement("h2");
  const dica = doc.createElement("p");
  dica.className = "sv-dica";
  const seletor = doc.createElement("div");
  const salvoEl = doc.createElement("span");
  salvoEl.className = "sv-salvo";
  salvoEl.setAttribute("role", "status");
  const cab = doc.createElement("div");
  cab.className = "sv-cab-secao";
  cab.append(rotulo, salvoEl);
  secao.append(cab, seletor, dica);
  el.replaceChildren(titulo, secao);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const textos = () => {
    doc.documentElement.lang = atual;
    doc.title = tx().ajustesTitulo;
    titulo.textContent = tx().ajustesTitulo;
    rotulo.textContent = tx().idioma;
    dica.textContent = tx().ajustesIdiomaDica;
  };
  const escolher = (i: Idioma) => {
    atual = i;
    definirIdioma(i);
    textos();
    f.salvar(i).then(
      () => {
        salvoEl.textContent = tx().salvo;
        salvoEl.classList.add("sv-visivel");
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => salvoEl.classList.remove("sv-visivel"), 1800);
      },
      () => salvoEl.classList.remove("sv-visivel"), // sem storage: a escolha vale só nesta página
    );
  };
  textos();
  renderSeletorIdioma(seletor, atual, escolher);
}
