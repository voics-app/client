import { expect, it, vi } from 'vitest';
import { DiscordyApi } from '../../src/infrastructure/http/discordyApi';
import type { HttpClient } from '../../src/infrastructure/http/httpClient';

it('uses the frozen scheduled-message routes and revision placement', async () => {
  const request = vi.fn(async () => undefined);
  const api = new DiscordyApi({ request } as unknown as HttpClient);
  const id = '12345678-1234-4123-8123-123456789abc';
  const create = { request_id: id, scheduled_at: '2026-11-19T08:00:00Z', message: { content: 'Hello', reply_to: '44', replied_user: false, silent: true } };
  await api.createScheduledMessage('10', create);
  expect(request).toHaveBeenLastCalledWith('POST', '/channels/10/messages/scheduled', { body: create, reason: undefined });
  await api.scheduledMessages('10', { after: id, limit: 50 });
  expect(request).toHaveBeenLastCalledWith('GET', '/channels/10/messages/scheduled', { query: { after: id, limit: 50 } });
  await api.scheduledMessage('10', id);
  expect(request).toHaveBeenLastCalledWith('GET', `/channels/10/messages/scheduled/${id}`, { query: undefined });
  const edit = { expected_revision: 4, message: { content: 'Changed' } };
  await api.editScheduledMessage('10', id, edit);
  expect(request).toHaveBeenLastCalledWith('PATCH', `/channels/10/messages/scheduled/${id}`, { body: edit });
  await api.cancelScheduledMessage('10', id, 5);
  expect(request).toHaveBeenLastCalledWith('DELETE', `/channels/10/messages/scheduled/${id}`, { query: { expected_revision: 5 } });
});
