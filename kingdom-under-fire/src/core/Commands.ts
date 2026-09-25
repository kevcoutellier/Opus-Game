/**
 * Every action of a player or of an AI reaches the simulation as a serialisable command, applied at the
 * start of a tick. The same stream can later be sent over the network (lockstep) or recorded for replays.
 */
export interface CommandBase {
  kind: string;
  team: number;
}

export class CommandQueue<C extends CommandBase = CommandBase> {
  private pending: C[] = [];
  private readonly handlers = new Map<string, (command: C) => void>();

  push(command: C): void {
    this.pending.push(command);
  }

  on<K extends C['kind']>(kind: K, handler: (command: Extract<C, { kind: K }>) => void): void {
    this.handlers.set(kind, handler as (command: C) => void);
  }

  /** Applies the queued commands in arrival order. Unknown kinds are an error, not a silent no-op. */
  apply(): number {
    const batch = this.pending;
    this.pending = [];
    for (const command of batch) {
      const handler = this.handlers.get(command.kind);
      if (!handler) throw new Error(`No handler for command ${command.kind}`);
      handler(command);
    }
    return batch.length;
  }

  get size(): number {
    return this.pending.length;
  }
}
