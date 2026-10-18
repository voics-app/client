import type { ConnectionProfile } from '../shared/ipc';
import { readJson, userDataPath, writeJson } from './persistence';

export interface MainSettings {
  connection: ConnectionProfile | null;
  pushToTalkKeycode: number | null;
}

const FILE = () => userDataPath('main-settings.json');

export function loadMainSettings(): MainSettings {
  return { connection: null, pushToTalkKeycode: null, ...(readJson<Partial<MainSettings>>(FILE()) ?? {}) };
}

export function saveMainSettings(patch: Partial<MainSettings>): MainSettings {
  const next = { ...loadMainSettings(), ...patch };
  writeJson(FILE(), next);
  return next;
}
