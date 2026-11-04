import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLightboxStore, type LightboxItem } from '../../src/application/stores/lightboxStore';
import { uploadFraction, useUploadStore } from '../../src/application/stores/uploadStore';

const item = (name: string): LightboxItem => ({ kind: 'image', src: `http://cdn/${name}`, original: `http://cdn/${name}`, filename: name });

describe('lightboxStore', () => {
  beforeEach(() => useLightboxStore.getState().close());

  it('opens at the clicked item and navigates around the ring', () => {
    const store = useLightboxStore.getState();
    store.open([item('a'), item('b'), item('c')], 1);
    expect(useLightboxStore.getState().index).toBe(1);
    useLightboxStore.getState().step(1);
    useLightboxStore.getState().step(1);
    expect(useLightboxStore.getState().index).toBe(0);
    useLightboxStore.getState().step(-1);
    expect(useLightboxStore.getState().index).toBe(2);
  });

  it('clamps a bad start index, ignores empty lists and closes', () => {
    useLightboxStore.getState().open([item('a')], 9);
    expect(useLightboxStore.getState().index).toBe(0);
    useLightboxStore.getState().close();
    expect(useLightboxStore.getState().items).toEqual([]);
    useLightboxStore.getState().open([], 3);
    expect(useLightboxStore.getState().items).toEqual([]);
  });
});

describe('uploadStore', () => {
  beforeEach(() => useUploadStore.setState({ uploads: {} }));

  it('tracks progress per message and can abort it', () => {
    const abort = vi.fn();
    useUploadStore.getState().begin('n1', 200, abort);
    useUploadStore.getState().progress('n1', 50);
    expect(uploadFraction(useUploadStore.getState().uploads.n1)).toBe(0.25);
    useUploadStore.getState().uploads.n1!.abort();
    expect(abort).toHaveBeenCalledOnce();
    useUploadStore.getState().end('n1');
    expect(useUploadStore.getState().uploads.n1).toBeUndefined();
  });

  it('ignores progress for unknown uploads and bounds the fraction', () => {
    useUploadStore.getState().progress('ghost', 10);
    expect(useUploadStore.getState().uploads).toEqual({});
    expect(uploadFraction(undefined)).toBe(0);
    expect(uploadFraction({ loaded: 5, total: 0 })).toBe(0);
    expect(uploadFraction({ loaded: 500, total: 100 })).toBe(1);
  });
});
