import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';

describe('voice store stream viewers', () => {
  beforeEach(() => useVoiceStore.getState().resetCall());

  it('keeps the viewer list until the local share stops', () => {
    const store = useVoiceStore.getState();
    store.setStreamViewers(['u2', 'u3']);
    expect(useVoiceStore.getState().streamViewers).toEqual(['u2', 'u3']);
    store.setLocalMedia({ localCamera: null });
    expect(useVoiceStore.getState().streamViewers).toEqual(['u2', 'u3']);
    store.setLocalMedia({ localScreen: null });
    expect(useVoiceStore.getState().streamViewers).toEqual([]);
  });

  it('clears viewers and screen ssrcs when the call resets', () => {
    const store = useVoiceStore.getState();
    store.setStreamViewers(['u2']);
    store.setScreenSsrc('u2:screen', 5);
    store.resetCall();
    expect(useVoiceStore.getState()).toMatchObject({ streamViewers: [], screenSsrcs: {} });
  });
});
