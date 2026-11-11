// Tipos mínimos da API `browser` do Firefox usados pela extensão.
interface PortaExt {
  postMessage(m: unknown): void;
  onMessage: { addListener(f: (m: unknown) => void): void };
  onDisconnect: { addListener(f: () => void): void };
}
declare const browser: {
  runtime: {
    id: string;
    onMessage: { addListener(f: (m: unknown, sender: { id?: string }) => Promise<unknown> | undefined): void };
    onConnect: { addListener(f: (p: PortaExt) => void): void };
    sendMessage(m: unknown): Promise<unknown>;
    connect(info?: { name?: string }): PortaExt;
  };
};
