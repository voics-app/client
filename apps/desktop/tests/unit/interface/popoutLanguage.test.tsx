// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { syncPopOutDocument, usePopOut } from '@renderer/interface/features/voice/usePopOut';

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.lang = 'en-US'; document.documentElement.dir = 'ltr'; });

it('copies language and direction on open and keeps them current in an existing call window', async () => {
  const childDocument = document.implementation.createHTMLDocument('Call');
  const child = { document: childDocument, closed: false, close: vi.fn(), addEventListener: vi.fn(), focus: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  document.documentElement.lang = 'nl';
  document.documentElement.dir = 'ltr';
  const { result } = renderHook(usePopOut);
  act(() => result.current.open());
  expect(childDocument.documentElement.lang).toBe('nl');
  expect(childDocument.documentElement.dir).toBe('ltr');
  act(() => { document.documentElement.lang = 'en-US'; document.documentElement.dir = 'rtl'; });
  await waitFor(() => expect(childDocument.documentElement.dir).toBe('rtl'));
  expect(childDocument.documentElement.lang).toBe('en-US');
});

it('removes an obsolete direction when mirroring a document without it', () => {
  const source = document.implementation.createHTMLDocument();
  const target = document.implementation.createHTMLDocument();
  target.documentElement.dir = 'rtl';
  syncPopOutDocument(source, target);
  expect(target.documentElement.hasAttribute('dir')).toBe(false);
});
