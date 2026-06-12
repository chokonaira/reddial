export interface TargetAdapter {
  readonly name: string;
  createSession(): TargetSession;
}

export interface TargetSession {
  send(message: string): Promise<string>;
  close?(): Promise<void>;
}
