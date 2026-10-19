/** Incoming-call ringtones the user can pick in Settings › Notifications. */
export type RingtoneId = 'classic' | 'chime' | 'digital' | 'soft';

export const RINGTONE_OPTIONS: readonly { id: RingtoneId; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'chime', label: 'Chime' },
  { id: 'digital', label: 'Digital' },
  { id: 'soft', label: 'Soft' },
];

export const DEFAULT_RINGTONE: RingtoneId = 'classic';
export const DEFAULT_RINGTONE_VOLUME = 0.8;
