import { useI18n } from '../../../shared/i18n';
import { useEffect, useState } from 'react';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ACTION_CATALOG, conflictsFor, infoFor, isDefault, resetKeybind, setKeybindGlobal, setKeybindKeys, DEFAULT_KEYBINDS } from '@discordy/core/domain/keybinds';
import { FIXED_SHORTCUTS } from '@discordy/core/domain/shortcutCatalog';
import { describeEvent } from '../../../app/shortcuts';
import { globalKeybindsSupported } from '../../../app/globalKeybinds';
import { Button } from '../../../shared/ui/Button';
import { SettingRow, Switch } from '../../../shared/ui/Form';

const FIXED = FIXED_SHORTCUTS.filter((s) => s.action).map((s) => ({ keys: s.keys, label: s.label }));
const GROUPS = ['Voice', 'Calls', 'Navigation', 'General'] as const;

/** Rebindable actions: record a combination, Global (system-wide) scope, per-action and full reset, conflict warnings. Device-local. */
export function KeybindsEditor() {
  const { t: msg, catalogText, list } = useI18n();
  const keybinds = usePrefsStore((s) => s.keybinds);
  const pttLabel = usePrefsStore((s) => s.pttLabel);
  const patch = usePrefsStore((s) => s.patch);
  const openSettings = useUiStore((s) => s.openSettings);
  const [recording, setRecording] = useState<string | null>(null);
  const globalOk = globalKeybindsSupported();

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      const keys = describeEvent(e);
      if (keys !== 'Escape') patch({ keybinds: setKeybindKeys(usePrefsStore.getState().keybinds, recording, keys) });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, patch]);

  const update = (next: typeof keybinds) => patch({ keybinds: next });

  return (
    <>
      {GROUPS.map((group) => (
        <section key={group} aria-label={catalogText(group)}>
          <h3>{catalogText(group)}</h3>
          {group === 'Voice' && (
            <SettingRow title={msg("settings.usertabs.push.to.talk")} description={pttLabel ? msg('keybind.bound', { keys: pttLabel }) : msg("settings.keybindseditor.not.set")}>
              <Button onClick={() => openSettings({ kind: 'user', tab: 'voice' })}>{msg("settings.keybindseditor.set.under.voice.and.video")}</Button>
            </SettingRow>
          )}
          {ACTION_CATALOG.filter((i) => i.group === group).map((info) => {
            const k = keybinds.find((b) => b.id === info.id);
            if (!k) return null;
            const conflicts = conflictsFor(keybinds, k.id, FIXED);
            return (
              <SettingRow key={k.id} title={catalogText(info.label)} description={conflicts.length > 0 ? <span role="alert">{msg('keybind.conflict', { names: list(conflicts.map(catalogText)) })}</span> : undefined}>
                <div className="setting-inline">
                  <Button onClick={() => setRecording(k.id)} aria-label={msg('keybind.change', { name: catalogText(info.label) })}>
                    <kbd className="kbd">{recording === k.id ? msg("settings.keybindseditor.press.keys") : k.keys || msg("settings.keybindseditor.not.bound")}</kbd>
                  </Button>
                  {globalOk && infoFor(k.action).globalCapable && (
                    <Switch label={msg('keybind.global', { name: catalogText(info.label) })} checked={Boolean(k.global)} disabled={!k.keys} onChange={(v) => update(setKeybindGlobal(keybinds, k.id, v))} />
                  )}
                  {k.keys && <Button variant="ghost" aria-label={msg('keybind.clear', { name: catalogText(info.label) })} onClick={() => update(setKeybindKeys(keybinds, k.id, ''))}>{msg("settings.usertabs.clear")}</Button>}
                  {!isDefault(k) && <Button variant="ghost" aria-label={msg('keybind.reset', { name: catalogText(info.label) })} onClick={() => update(resetKeybind(keybinds, k.id))}>{msg("common.reset")}</Button>}
                </div>
              </SettingRow>
            );
          })}
        </section>
      ))}
      <div className="row-end">
        <Button variant="ghost" onClick={() => update(DEFAULT_KEYBINDS.map((k) => ({ ...k })))}>{msg("settings.keybindseditor.reset.all.to.defaults")}</Button>
      </div>
    </>
  );
}
