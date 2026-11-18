import { expect, it } from 'vitest';
import { acceptFiles, formatCountdown } from '../../src/domain/composerLimits';
import { alertBody } from '../../src/domain/incomingAlert';

it('formats plural upload failures in Dutch and returns the original acceptable file objects', () => {
  const accepted = { name: 'Original مرحبا', size: 5 };
  const result = acceptFiles([], [accepted, { size: 0 }, { size: 6 * 1048576 }], 5 * 1048576, false, 10, 'nl');
  expect(result.accepted[0]).toBe(accepted);
  expect(result.problems).toEqual(['2 bestanden zijn leeg of groter dan 5 MB.']);
  expect(formatCountdown(3660, 'nl')).toBe('1u 1m');
});

it('localizes private notification placeholders without translating message content or exposing private text', () => {
  expect(alertBody({ content: 'Sent an attachment' }, 180, 'nl')).toBe('Sent an attachment');
  expect(alertBody({ content: 'secret مرحبا', deliveryMode: 'p2p' }, 180, 'nl')).toBe('Heeft een privébericht gestuurd');
  expect(alertBody({ content: '' }, 180, 'nl')).toBe('Heeft een bijlage gestuurd');
});
