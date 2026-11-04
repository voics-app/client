// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { AccessibilityTab, AppearanceTab } from '@renderer/interface/features/settings/user/UserTabs';
import { AnimatedImage } from '@renderer/interface/shared/ui/AnimatedImage';
import { RoleDot } from '@renderer/interface/shared/ui/RoleDot';

afterEach(() => {
  cleanup();
  usePrefsStore.setState(DEFAULT_PREFS);
});

describe('Accessibility page', () => {
  it('switches write to the prefs store', () => {
    render(<AccessibilityTab />);
    fireEvent.click(screen.getByRole('switch', { name: 'High contrast' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Always underline links' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Play GIFs automatically' }));
    fireEvent.click(screen.getByRole('radio', { name: 'As a dot' }));
    const s = usePrefsStore.getState();
    expect([s.highContrast, s.linkUnderline, s.animateGifs, s.roleColors]).toEqual([true, true, false, 'dot']);
  });
  it('reduce motion lives here and sync-with-computer defaults on', () => {
    render(<AccessibilityTab />);
    expect(screen.getByRole('switch', { name: 'Sync reduced motion with computer' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(usePrefsStore.getState().reduceMotion).toBe(true);
  });
});

describe('Appearance page', () => {
  it('toggles sync with computer and resets zoom', () => {
    usePrefsStore.setState({ zoom: 1.4 });
    render(<AppearanceTab />);
    fireEvent.click(screen.getByRole('switch', { name: 'Sync theme with computer' }));
    expect(usePrefsStore.getState().syncOsTheme).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(usePrefsStore.getState().zoom).toBe(1);
  });
});

describe('role dot and animated image', () => {
  it('draws a dot only for a colour', () => {
    const { container } = render(<><RoleDot color="#f00" /><RoleDot color={undefined} /></>);
    expect(container.querySelectorAll('.role-dot')).toHaveLength(1);
  });
  it('keeps the source when animation is allowed', () => {
    const { container } = render(<AnimatedImage kind="gif" animated src="http://x/a.gif" alt="a" />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('http://x/a.gif');
    expect(container.querySelector('img')!.hasAttribute('data-still')).toBe(false);
  });
});
