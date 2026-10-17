/** Tiny typed listener set. */
export class Listeners<A extends unknown[]> {
  private readonly set = new Set<(...args: A) => void>();

  add(listener: (...args: A) => void): () => void {
    this.set.add(listener);
    return () => this.set.delete(listener);
  }

  emit(...args: A): void {
    for (const listener of [...this.set]) {
      try {
        listener(...args);
      } catch (error) {
        console.error('listener failed', error);
      }
    }
  }

  clear(): void {
    this.set.clear();
  }
}
