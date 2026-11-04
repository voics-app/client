import { useEffect, useId } from 'react';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';

/** Registers a page's dirty state so settings cannot be closed over unsaved edits. Clears itself on unmount. */
export function useUnsavedChanges(dirty: boolean, id?: string): void {
  const auto = useId();
  const key = id ?? auto;
  useEffect(() => {
    useUnsavedStore.getState().setDirty(key, dirty);
  }, [key, dirty]);
  useEffect(() => () => useUnsavedStore.getState().setDirty(key, false), [key]);
}
