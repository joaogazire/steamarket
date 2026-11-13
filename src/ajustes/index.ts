import { montarPaginaAjustes } from "./pagina.ts";

void montarPaginaAjustes(document.querySelector("main") ?? document.body, {
  ler: async () => (await browser.storage.local.get("idioma")).idioma,
  salvar: (i) => browser.storage.local.set({ idioma: i }),
  navegador: browser.i18n.getUILanguage(),
});
