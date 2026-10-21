// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsCloseButton } from '@renderer/interface/features/settings/SettingsCloseButton';

describe('settings close button', () => {
  it('is a labelled button with an ESC caption and closes on click', () => {
    const onClose = vi.fn();
    render(<SettingsCloseButton onClose={onClose} />);
    expect(screen.getByText('ESC')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
