import { renderRouter, screen } from 'expo-router/testing-library';
import { MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { BRAND } from '../src/brand';

describe('app shell', () => {
  it('opens on the sign-in placeholder with the brand name', async () => {
    await renderRouter('./app', { initialUrl: '/' });
    expect(await screen.findByText(BRAND.displayName)).toBeTruthy();
    expect(screen.getByText('Sign in arrives with the text MVP.')).toBeTruthy();
  });

  it('renders copy from @discordy/core with the installed brand', async () => {
    await renderRouter('./app', { initialUrl: '/' });
    expect(await screen.findByText(MODE_COPY.standard.description)).toBeTruthy();
    expect(MODE_COPY.standard.description).toContain(BRAND.displayName);
  });

  it('shows the four tabs skeleton', async () => {
    await renderRouter('./app', { initialUrl: '/servers' });
    for (const title of ['Servers', 'DMs', 'Notifications', 'You']) {
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
    }
  });
});
