import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real factories need browser media APIs; stand in with recording fakes.
const created: Array<{ gateway: unknown; dispose: ReturnType<typeof vi.fn> }> = [];
vi.mock('@renderer/infrastructure/voice/browserVoice', () => ({
  createVoiceController: ({ gateway }: { gateway: unknown }) => {
    const controller = { gateway, dispose: vi.fn(), leave: vi.fn(async () => undefined), onVoiceServerUpdate: vi.fn() };
    created.push(controller);
    return controller;
  },
  createWatchTogetherService: () => ({ detach: vi.fn(), dispose: vi.fn() }),
}));

function fakeRuntime(name: string) {
  return {
    info: { platform: 'win32' },
    gateway: { name },
    hooks: { onVoiceServerUpdate: () => undefined, onSignedIn: [], onSignedOut: [] as Array<() => void> },
  } as never;
}

describe('registerEngines', () => {
  beforeEach(() => {
    created.length = 0;
    vi.resetModules();
  });

  it('rebinds to the runtime that actually boots (React StrictMode creates two in dev)', async () => {
    const { registerEngines, getEngines } = await import('@renderer/interface/app/engines');
    const discarded = fakeRuntime('discarded');
    const booted = fakeRuntime('booted');

    registerEngines(discarded);
    registerEngines(booted);

    expect((getEngines()?.voice as unknown as { gateway: { name: string } }).gateway.name).toBe('booted');
    expect(created[0]?.dispose).toHaveBeenCalled();
  });

  it('is idempotent for the same runtime', async () => {
    const { registerEngines } = await import('@renderer/interface/app/engines');
    const rt = fakeRuntime('one');
    const first = registerEngines(rt);
    expect(registerEngines(rt)).toBe(first);
    expect(created).toHaveLength(1);
  });
});
