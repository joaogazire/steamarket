import { historico, inventario, itemNameId, ordens, visaoGeral } from "../steam/cliente.ts";
import { abrirCache } from "./cache.ts";
import { criarFila } from "./fila.ts";
import { criarRoteador } from "./roteador.ts";

const portas = new Set<PortaExt>();
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
  p.onDisconnect.addListener(() => portas.delete(p));
});
// Só aceita mensagens do próprio add-on.
browser.runtime.onMessage.addListener((m, sender) =>
  sender.id === browser.runtime.id ? roteadorPronto.then((r) => r.tratar(m)) : undefined,
);
