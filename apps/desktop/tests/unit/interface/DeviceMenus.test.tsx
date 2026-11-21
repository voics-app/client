// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceMenuEntries, NoiseSuppressionButton } from '../../../src/renderer/interface/features/voice/DeviceMenus';
import { Menu } from '../../../src/renderer/interface/shared/ui/Menu';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { createI18n } from '@discordy/core/domain/i18n';
import { deviceChoices } from '@discordy/core/domain/voicePanel';

afterEach(cleanup);

const choices = [{ id: '', label: 'System default' }, { id: 'a', label: 'USB Mic' }];

describe('deviceMenuEntries', () => {
  it('uses Dutch controls while leaving hardware labels and selected device IDs intact', () => {
    const intl = createI18n('nl');
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const localizedChoices = deviceChoices([{ deviceId: 'hardware-1', kind: 'audioinput', label: 'Input volume مرحبا' }, { deviceId: 'hardware-2', kind: 'audioinput', label: '' }], 'audioinput', 'Microphone', intl.locale);
    render(<Menu open x={0} y={0} onClose={() => undefined} entries={deviceMenuEntries({ kind: 'input', choices: localizedChoices, selected: null, onSelect, volume: { value: 1, onChange }, onOpenVoiceSettings: () => undefined }, intl)} />);
    expect(screen.getByText('Invoerapparaat')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Microfoon 2/ })).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Invoervolume' }), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenCalledWith(1.5);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Input volume مرحبا' }));
    expect(onSelect).toHaveBeenCalledWith('hardware-1');
  });

  it('checks the active device, selects another, and drives the volume slider', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    render(<Menu open x={0} y={0} onClose={() => undefined} entries={deviceMenuEntries({ kind: 'input', choices, selected: 'a', onSelect, volume: { value: 1, onChange }, onOpenVoiceSettings: () => undefined })} />);
    expect(screen.getByRole('menuitem', { name: /USB Mic/ }).textContent).toContain('●');
    expect(screen.getByRole('menuitem', { name: /System default/ }).textContent).not.toContain('●');
    fireEvent.change(screen.getByRole('slider', { name: 'Input volume' }), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenCalledWith(1.5);
    fireEvent.click(screen.getByRole('menuitem', { name: /System default/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('omits the slider for cameras and offers a camera test', () => {
    const open = vi.fn();
    render(<Menu open x={0} y={0} onClose={() => undefined} entries={deviceMenuEntries({ kind: 'camera', choices, selected: null, onSelect: () => undefined, onOpenVoiceSettings: open })} />);
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Test camera' }));
    expect(open).toHaveBeenCalled();
  });
});

describe('NoiseSuppressionButton', () => {
  it('toggles the noise suppression preference', () => {
    usePrefsStore.setState({ noiseSuppression: true });
    render(<NoiseSuppressionButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Noise suppression: on' }));
    expect(usePrefsStore.getState().noiseSuppression).toBe(false);
    expect(screen.getByRole('button', { name: 'Noise suppression: off' })).toBeTruthy();
  });
});
