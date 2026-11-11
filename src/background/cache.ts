export interface Cache {
  obter<T>(chave: string, ttlMs: number): Promise<T | undefined>;
  guardar(chave: string, valor: unknown): Promise<void>;
}

type Registro = { chave: string; valor: unknown; em: number };

export async function abrirCache(nomeDb: string, agora: () => number = Date.now): Promise<Cache> {
  const db = await new Promise<IDBDatabase>((ok, falha) => {
    const req = indexedDB.open(nomeDb, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("cache", { keyPath: "chave" });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });

  const executar = <T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T>((ok, falha) => {
      const req = f(db.transaction("cache", modo).objectStore("cache"));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });

  return {
    async obter<T>(chave: string, ttlMs: number): Promise<T | undefined> {
      const reg = await executar<Registro | undefined>("readonly", (s) => s.get(chave));
      return reg && agora() - reg.em <= ttlMs ? (reg.valor as T) : undefined;
    },
    async guardar(chave: string, valor: unknown): Promise<void> {
      await executar("readwrite", (s) => s.put({ chave, valor, em: agora() } satisfies Registro));
    },
  };
}
