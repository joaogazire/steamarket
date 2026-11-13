/** Controles do painel: status/progresso dos preços e as duas opções (ocultar listados, clique lista). */
export interface OpcoesPainel {
  ocultarListados: boolean;
  cliqueLista: boolean;
}

export interface CallbacksControles {
  aoMudar(o: OpcoesPainel): void;
}

export interface ControlesPainel {
  progresso(k: number, n: number): void;
  status(texto: string): void;
}

export function renderControles(el: HTMLElement, cb: CallbacksControles): ControlesPainel {
  const doc = el.ownerDocument;
  el.replaceChildren();
  const estado: OpcoesPainel = { ocultarListados: false, cliqueLista: false };
  const caixa = (rotulo: string, inicial: boolean, aoMudar: (v: boolean) => void): HTMLLabelElement => {
    const l = doc.createElement("label");
    l.className = "sv-opcao";
    const i = doc.createElement("input");
    i.type = "checkbox";
    i.setAttribute("role", "switch");
    i.checked = inicial;
    i.addEventListener("change", () => {
      aoMudar(i.checked);
      cb.aoMudar({ ...estado });
    });
    const texto = doc.createElement("span");
    texto.textContent = rotulo;
    l.append(i, texto);
    return l;
  };
  const status = doc.createElement("div");
  status.className = "sv-status";
  el.append(
    caixa("Listar ao clicar", estado.cliqueLista, (v) => (estado.cliqueLista = v)),
    caixa("Ocultar itens já listados", estado.ocultarListados, (v) => (estado.ocultarListados = v)),
    status,
  );
  return {
    progresso: (k, n) => void (status.textContent = `preços ${k}/${n}`),
    status: (t) => void (status.textContent = t),
  };
}
