/** Holds deep-link routes that arrive before the user is signed in, then releases them once the app is ready. */
export class RouteQueue {
  private pending: string | null = null;

  constructor(private readonly isReady: () => boolean, private readonly apply: (route: string) => void) {}

  /** Applies the route now, or keeps the latest one until `flush`. */
  push(route: string): void {
    if (this.isReady()) this.apply(route);
    else this.pending = route;
  }

  flush(): void {
    if (!this.pending || !this.isReady()) return;
    const route = this.pending;
    this.pending = null;
    this.apply(route);
  }
}
