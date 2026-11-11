# Steam Vendas

Extensão Firefox (MV3) que adiciona um painel na página do seu inventário Steam: agrupa itens iguais, mostra preços e histórico, sugere preço em 3 modos e vende em lote.

## Rodar

```
npm install
npm test            # testes (vitest)
npm run build       # gera dist/
npx web-ext run --source-dir dist    # abre o Firefox com a extensão temporária
```

## Instalar de forma permanente

`npm run assinar` assina como extensão não listada (precisa de `WEB_EXT_API_KEY` e `WEB_EXT_API_SECRET` da conta do Firefox Add-ons) e gera um `.xpi` em `web-ext-artifacts/`.

## Antes do primeiro uso real

As respostas da Steam usadas nos testes são parcialmente sintéticas. Leia `fixtures/NOTAS.md` e rode a captura (`scripts/capturar.ts`) com a sua sessão para validar o formato real.
Comece vendendo 1 item barato e confirme no celular.
