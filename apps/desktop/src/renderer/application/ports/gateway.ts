export type GatewayState = 'idle' | 'connecting' | 'identifying' | 'resuming' | 'ready' | 'reconnecting' | 'closed';

export interface GatewayPort {
  readonly state: GatewayState;
  connect(): void;
  disconnect(): void;
  send(op: number, d: unknown): void;
  onDispatch(listener: (event: string, data: unknown) => void): () => void;
  onState(listener: (state: GatewayState) => void): () => void;
  onFatal(listener: (code: number) => void): () => void;
  onOp(listener: (op: number, data: unknown) => void): () => void;
}
