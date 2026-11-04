/** Self presence state shared by the status picker, custom status and the idle monitor. */
import { selfPresencePayload, type ManualStatus, type SelfPresencePayload } from '@discordy/core/domain/selfPresence';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

let autoIdle = false;

export function isAutoIdle(): boolean {
  return autoIdle;
}

export function setAutoIdle(value: boolean): void {
  autoIdle = value;
}

export function manualStatus(): ManualStatus | undefined {
  const status = useSessionStore.getState().settings.status;
  return status && status !== 'offline' ? status : undefined;
}

/** What this device should currently tell the gateway. */
export function currentPresence(nowMs: number = Date.now()): SelfPresencePayload {
  return selfPresencePayload(manualStatus(), useSessionStore.getState().settings.custom_status, autoIdle, nowMs);
}
