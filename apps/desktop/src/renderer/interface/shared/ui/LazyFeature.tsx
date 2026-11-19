import { Component, Suspense, lazy, useState, type ComponentType, type ReactNode } from 'react';

/** Retry transient chunk failures with exponential backoff. */
export async function retryImport<T>(load: () => Promise<T>, delays = [250, 500, 1000]): Promise<T> {
  for (const delay of delays) {
    try { return await load(); } catch { await new Promise((resolve) => setTimeout(resolve, delay)); }
  }
  return load();
}

class LoadBoundary extends Component<{ children: ReactNode; retry: () => void; close: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return <div role="alert">Could not load this feature. <button type="button" onClick={this.props.retry}>Try again</button> <button type="button" onClick={this.props.close}>Close</button> <button type="button" onClick={() => window.location.reload()}>Reload app</button><p>Reloading may discard unsaved changes.</p></div>;
    return this.props.children;
  }
}

export function LazyFeature<P extends object>({ load, props, close }: { load: () => Promise<{ default: ComponentType<P> }>; props: P; close: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [Feature, setFeature] = useState(() => lazy(() => retryImport(load)));
  const retry = () => { setFeature(() => lazy(() => retryImport(load))); setAttempt((n) => n + 1); };
  return <LoadBoundary key={attempt} retry={retry} close={close}><Suspense fallback={<div role="status">Loading?</div>}><Feature {...props} /></Suspense></LoadBoundary>;
}
