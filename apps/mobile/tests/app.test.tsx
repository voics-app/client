import { renderRouter, screen } from 'expo-router/testing-library';
import { BRAND } from '../src/brand';

describe('app shell', () => {
  it('opens on the sign-in placeholder with the brand name', async () => {
    await renderRouter('./app', { initialUrl: '/' });
    expect(await screen.findByText(BRAND.displayName)).toBeTruthy();
    expect(screen.getByText('Sign in arrives with the text MVP.')).toBeTruthy();
  });

  it('shows the four tabs skeleton', async () => {
    await renderRouter('./app', { initialUrl: '/servers' });
    for (const title of ['Servers', 'DMs', 'Notifications', 'You']) {
      expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
    }
  });
});
