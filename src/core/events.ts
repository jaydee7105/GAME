/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown[]>> {
  private handlers: { [K in keyof Events]?: ((...args: Events[K]) => void)[] } = {};

  on<K extends keyof Events>(name: K, fn: (...args: Events[K]) => void): () => void {
    (this.handlers[name] ??= []).push(fn);
    return () => {
      this.handlers[name] = this.handlers[name]?.filter((h) => h !== fn);
    };
  }

  emit<K extends keyof Events>(name: K, ...args: Events[K]): void {
    for (const h of this.handlers[name] ?? []) h(...args);
  }
}
