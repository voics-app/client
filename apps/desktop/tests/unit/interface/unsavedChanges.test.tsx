// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedStore } from '@renderer/application/stores/unsavedStore';
import { useUnsavedChanges } from '@renderer/interface/shared/hooks/useUnsavedChanges';
import { UnsavedBar } from '@renderer/interface/shared/ui/UnsavedBar';

beforeEach(() => useUnsavedStore.setState({ sources: {}, shake: 0, escBlocked: false }));
afterEach(cleanup);

describe('useUnsavedChanges', () => {
  it('registers the dirty state and clears it on unmount', () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty, 'p'), { initialProps: { dirty: false } });
    expect(useUnsavedStore.getState().sources).toEqual({});
    rerender({ dirty: true });
    expect(useUnsavedStore.getState().sources).toEqual({ p: true });
    unmount();
    expect(useUnsavedStore.getState().sources).toEqual({});
  });

  it('keeps separate pages apart', () => {
    renderHook(() => useUnsavedChanges(true));
    renderHook(() => useUnsavedChanges(true));
    expect(Object.keys(useUnsavedStore.getState().sources)).toHaveLength(2);
  });
});

describe('UnsavedBar', () => {
  it('renders only while dirty and wires Reset and Save', () => {
    const onReset = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(<UnsavedBar dirty={false} onReset={onReset} onSave={onSave} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<UnsavedBar dirty onReset={onReset} onSave={onSave} />);
    expect(screen.getByRole('status').textContent).toContain('unsaved changes');
    fireEvent.click(screen.getByText('Reset'));
    fireEvent.click(screen.getByText('Save changes'));
    expect(onReset).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('shakes when a close is refused', () => {
    render(<UnsavedBar dirty onReset={() => undefined} onSave={() => undefined} />);
    expect(useUnsavedStore.getState().sources).not.toEqual({});
    expect(screen.getByRole('status').classList.contains('is-shaking')).toBe(false);
    act(() => void useUnsavedStore.getState().requestLeave());
    expect(screen.getByRole('status').classList.contains('is-shaking')).toBe(true);
  });
});
