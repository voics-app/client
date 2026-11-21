import { useState } from 'react';
import { Text } from 'react-native';
import { saveHideAgeRestrictedChannels } from '@discordy/core/application/ageRestrictedAccess';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { hidesAgeRestrictedChannels } from '@discordy/core/domain/ageRestricted';
import { createI18n } from '@discordy/core/domain/i18n';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { SwitchRow } from './rows';

export function AgeRestrictedSetting() {
  const settings = useSessionStore((s) => s.settings);
  const { t } = createI18n(settings.locale);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const change = async (hide: boolean) => {
    setBusy(true); setFailed(false);
    try { await saveHideAgeRestrictedChannels(getRuntime().api, hide); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <>
    <SwitchRow title={t('age.hideSetting')} description={t('age.settingBody')} value={hidesAgeRestrictedChannels(settings.preferences?.hide_age_restricted_channels)} disabled={busy} onChange={(hide) => void change(hide)} />
    {failed && <Text accessibilityRole="alert" style={{ color: theme.danger, padding: 16 }}>{t('age.saveError')}</Text>}
  </>;
}
