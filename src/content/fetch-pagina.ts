/**
 * fetch que sai da própria página (Firefox: `content.fetch` no content script). A venda precisa disso:
 * vinda do background, a Steam recebe origem moz-extension:// e sem Referer (o navegador descarta esse
 * cabeçalho) e responde 400. O SIH faz o mesmo POST de dentro da página.
 * O resultado é copiado para uma Response local; o signal (objeto do content script) não atravessa,
 * então o tempo limite é feito aqui.
 */
type FetchBase = (url: string, init?: RequestInit) => Promise<Response>;

const SEM_CORPO = new Set([101, 204, 205, 304]);

export function fetchDaPagina(base: FetchBase, limiteMs = 30_000): typeof fetch {
  return (async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
    const { signal: _ignorado, headers, ...resto } = init;
    let pedidoInit: RequestInit = resto;
    if (headers && typeof headers === "object" && !Array.isArray(headers) && !(headers instanceof Headers)) {
      const limpos = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== "referer"));
      pedidoInit = { ...resto, headers: limpos };
    } else if (headers !== undefined) {
      pedidoInit = { ...resto, headers };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tempo = new Promise<never>((_, falha) => {
      timer = setTimeout(() => falha(new TypeError("tempo esgotado")), limiteMs);
    });
    try {
      const r = await Promise.race([base(String(entrada), pedidoInit), tempo]);
      const corpo = SEM_CORPO.has(r.status) ? null : await Promise.race([r.text(), tempo]);
      return new Response(corpo, { status: r.status, statusText: r.statusText });
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
}
