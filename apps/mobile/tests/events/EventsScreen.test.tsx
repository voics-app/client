import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EventsScreen } from '../../src/events/EventsScreen';

const mockApi = {
  guildScheduledEvents: jest.fn(async () => [{ id: '9', guild_id: '1', name: 'Community call', scheduled_start_time: '2026-12-01T12:00:00Z', entity_metadata: { location: 'Online' }, description: 'Join us', user_count: 3 }]),
  guildScheduledEventInterest: jest.fn(async () => ({ interested: false })),
  setGuildScheduledEventInterest: jest.fn(async () => undefined),
};
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: mockApi }) }));

beforeEach(() => jest.clearAllMocks());

it('loads the selected event and updates interest', async () => {
  await render(<EventsScreen guildId="1" eventId="9" />);
  expect(await screen.findByText('Community call')).toBeTruthy();
  expect(screen.getByText('Online')).toBeTruthy();
  await fireEvent.press(await screen.findByLabelText('Mark interested in Community call'));
  await waitFor(() => expect(mockApi.setGuildScheduledEventInterest).toHaveBeenCalledWith('1', '9', true));
  expect(await screen.findByLabelText('Remove interest in Community call')).toBeTruthy();
});

it('allows retry after a list failure', async () => {
  mockApi.guildScheduledEvents.mockRejectedValueOnce(new Error('offline'));
  await render(<EventsScreen guildId="1" />);
  await fireEvent.press(await screen.findByLabelText('Retry'));
  expect(await screen.findByText('Community call')).toBeTruthy();
});
