import { historico, inventario, itemNameId, ordens, vender, visaoGeral } from "../steam/cliente.ts";
import { abrirCache } from "./cache.ts";
import { criarFila } from "./fila.ts";
import { iniciarLote, validarPedidoLote, type Lote } from "./venda-lote.ts";
import { criarRoteador } from "./roteador.ts";

const portas = new Set<PortaExt>();
// cada lote pertence a uma aba: fechar a aba cancela o lote e só ela recebe o progresso
const lotes = new Map<string, { lote: Lote; tabId: number | undefined }>();
const tabDaPorta = (p: PortaExt) => p.sender?.tab?.id;
const fila = criarFila({
  // PRC-03: a interface mostra "aguardando limite da Steam" enquanto a fila espera.
  aoPausar: (ms) => portas.forEach((p) => p.postMessage({ tipo: "pausa", ms })),
});
const f: typeof fetch = (...a) => fetch(...a);

const roteadorPronto = abrirCache("steam-vendas").then((cache) =>
  criarRoteador({
    fila,
    cache,
    steam: {
      inventario: (steamid, appid, contextid) => inventario(f, steamid, appid, contextid),
      historico: (appid, nome) => historico(f, appid, nome),
      visaoGeral: (appid, nome, moeda) => visaoGeral(f, appid, nome, moeda),
      ordens: (nameId, moeda, pais) => ordens(f, nameId, moeda, pais),
      itemNameId: (appid, nome) => itemNameId(f, appid, nome),
    },
  }),
);

browser.runtime.onConnect.addListener((p) => {
  portas.add(p);
  p.onDisconnect.addListener(() => {
    portas.delete(p);
    // fechou ou recarregou a aba do painel: ninguém vê o progresso, então o lote dela para
    const tab = tabDaPorta(p);
    if (![...portas].some((q) => tabDaPorta(q) === tab)) lotes.forEach((l) => l.tabId === tab && l.lote.cancelar());
  });
});
// Só um lote por vez; a venda vai pela mesma fila das consultas.
async function tratarLote(m: Record<string, unknown>, tabId: number | undefined): Promise<unknown> {
  if (m.tipo === "lote-cancelar") {
    if (typeof m.loteId === "string") lotes.get(m.loteId)?.lote.cancelar();
    return { ok: true };
  }
  const pedido = validarPedidoLote(m);
  if (!pedido || lotes.size > 0) return { ok: false, mensagem: "pedido de venda inválido ou outro lote em andamento" };
  const ctx = { sessionid: pedido.sessionid, steamid: pedido.steamid };
  const lote = iniciarLote(
    { fila, vender: (ativo, liquido) => vender(f, ctx, ativo, liquido) },
    pedido.ativos,
    pedido.liquido,
    pedido.loteId,
    (k, n) => portas.forEach((p) => tabDaPorta(p) === tabId && p.postMessage({ tipo: "progresso", loteId: pedido.loteId, k, n })),
  );
  lotes.set(pedido.loteId, { lote, tabId });
  try {
    return { ok: true, resumo: await lote.concluido };
  } finally {
    lotes.delete(pedido.loteId);
  }
}

// Só aceita mensagens do próprio add-on.
browser.runtime.onMessage.addListener((m, sender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  const tipo = (m as { tipo?: unknown } | null)?.tipo;
  if (tipo === "lote-iniciar" || tipo === "lote-cancelar") return tratarLote(m as Record<string, unknown>, sender.tab?.id);
  return roteadorPronto.then((r) => r.tratar(m));
});
