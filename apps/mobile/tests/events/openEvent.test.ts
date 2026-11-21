import { router } from 'expo-router';
import { openEvent } from '../../src/events/openEvent';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

it('opens the guild events route and carries the tapped event', () => {
  openEvent('1', '9');
  expect(router.push).toHaveBeenCalledWith({ pathname: '/servers/[guildId]/events', params: { guildId: '1', eventId: '9' } });
  openEvent('1');
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/servers/[guildId]/events', params: { guildId: '1' } });
});
