/**
 * Minimal typed publish/subscribe. The simulation emits events synchronously during a tick (deaths, hits,
 * orders); the renderer, the audio and the UI subscribe without the simulation knowing about them.
 */
export type EventMap = Record<string, unknown>;
type Handler<T> = (payload: T) => void;

export class EventBus<E extends EventMap> {
  private readonly handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const list = (this.handlers[type] ??= []);
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.handlers[type];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  clear(): void {
    for (const key of Object.keys(this.handlers)) delete this.handlers[key as keyof E];
  }
}
