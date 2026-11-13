import type { Grupo } from "../core/tipos.ts";

export type EstadoLista =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; grupos: Grupo[] };

export interface CallbacksLista {
  aoExpandir(grupo: Grupo): void;
  aoTentar(): void;
  /** botão "Listar 1" da linha; recebe o grupo e o preço que o comprador paga (centavos) */
  aoVender?(grupo: Grupo, precoComprador: number): void;
  formatar?(centavos: number): string;
  /** só para testes: por padrão, apenas cliques reais do usuário (isTrusted) disparam a venda */
  permitirSintetico?: boolean;
}

export type SugestaoLinha = { preco: number | null; base: string } | "erro";

export interface ControleLista {
  /** mostra o preço sugerido na linha do grupo (pelo nome) e habilita o botão */
  definirSugestao(grupo: { appid: number; nome: string }, s: SugestaoLinha): void;
  /** atualiza o contador depois de uma venda */
  atualizarContagem(grupo: { appid: number; nome: string }): void;
  /** marca como indisponíveis as linhas que ainda esperam sugestão (busca interrompida) */
  encerrarPendentes(): void;
}

const SEM_CONTROLE: ControleLista = { definirSugestao: () => undefined, atualizarContagem: () => undefined, encerrarPendentes: () => undefined };
const chave = (g: { appid: number; nome: string }) => `${g.appid}|${g.nome}`;

/** INV-01 / INV-04. Todo texto entra por textContent, nunca como HTML. */
export function renderLista(el: HTMLElement, estado: EstadoLista, cb: CallbacksLista): ControleLista {
  const doc = el.ownerDocument;
  el.replaceChildren();
  if (estado.tipo === "carregando") {
    el.textContent = "carregando inventário…";
    return SEM_CONTROLE;
  }
  if (estado.tipo === "erro") {
    const msg = doc.createElement("p");
    msg.textContent = estado.mensagem;
    const b = doc.createElement("button");
    b.textContent = "tentar de novo";
    b.addEventListener("click", () => cb.aoTentar());
    el.append(msg, b);
    return SEM_CONTROLE;
  }
  if (estado.grupos.length === 0) {
    el.textContent = "nenhum item vendável";
    return SEM_CONTROLE;
  }
  const fmt = cb.formatar ?? ((c: number) => String(c));
  const linhas = new Map<string, { n: HTMLElement; sug: HTMLElement; botao: HTMLButtonElement; grupo: Grupo; preco: number | null }>();
  for (const g of estado.grupos) {
    const linha = doc.createElement("div");
    linha.className = "sv-grupo";
    linha.tabIndex = 0;
    linha.setAttribute("role", "button");
    const nome = doc.createElement("span");
    nome.className = "sv-nome";
    nome.textContent = g.nome;
    const n = doc.createElement("span");
    n.className = "sv-contagem";
    n.textContent = `×${g.contagem}`;
    const sug = doc.createElement("span");
    sug.className = "sv-sugestao";
    sug.textContent = "…";
    const botao = doc.createElement("button");
    botao.className = "sv-listar";
    botao.textContent = "Listar 1";
    botao.disabled = true;
    const reg = { n, sug, botao, grupo: g, preco: null as number | null };
    botao.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!cb.permitirSintetico && !e.isTrusted) return;
      if (botao.disabled || reg.preco === null || reg.grupo.ativos.length === 0) return;
      // Espaço/Enter com o foco no botão gerariam outro clique "real": desabilita até a venda terminar.
      botao.disabled = true;
      botao.blur();
      cb.aoVender?.(reg.grupo, reg.preco);
    });
    botao.addEventListener("keydown", (e) => e.stopPropagation());
    linha.append(nome, " ", n, " ", sug, " ", botao);
    linha.addEventListener("click", () => cb.aoExpandir(g));
    linha.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") cb.aoExpandir(g);
    });
    linhas.set(chave(g), reg);
    el.append(linha);
  }
  return {
    definirSugestao(grupo, s) {
      const r = linhas.get(chave(grupo));
      if (!r) return;
      if (s === "erro") {
        r.preco = null;
        r.sug.textContent = "indisponível";
        r.botao.disabled = true;
        r.botao.textContent = "Listar 1";
      } else if (s.preco === null) {
        r.preco = null;
        r.sug.textContent = "sem preço";
        r.botao.disabled = true;
        r.botao.textContent = "Listar 1";
      } else {
        r.preco = s.preco;
        r.sug.textContent = fmt(s.preco);
        r.sug.title = s.base;
        r.botao.disabled = false;
        r.botao.textContent = `Listar 1 por ${fmt(s.preco)}`;
      }
    },
    atualizarContagem(grupo) {
      const r = linhas.get(chave(grupo));
      if (!r) return;
      r.n.textContent = `×${r.grupo.contagem}`;
      r.botao.disabled = r.preco === null || r.grupo.ativos.length === 0;
    },
    encerrarPendentes() {
      for (const r of linhas.values()) if (r.sug.textContent === "…") r.sug.textContent = "indisponível";
    },
  };
}
