import { useState } from 'react';
import { saveHideAgeRestrictedChannels } from '@discordy/core/application/ageRestrictedAccess';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { hidesAgeRestrictedChannels } from '@discordy/core/domain/ageRestricted';
import { getRuntime } from '../../../app/runtime';
import { useI18n } from '../../../shared/i18n';
import { SettingRow, Switch } from '../../../shared/ui/Form';

export function AgeRestrictedSetting() {
  const { t } = useI18n();
  const hidden = useSessionStore((s) => hidesAgeRestrictedChannels(s.settings.preferences?.hide_age_restricted_channels));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const change = async (hide: boolean) => {
    setBusy(true); setFailed(false);
    try { await saveHideAgeRestrictedChannels(getRuntime().api, hide); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <>
    <SettingRow title={t('age.hideSetting')} searchKey="Hide age-restricted channels" description={t('age.settingBody')}>
      <Switch label={t('age.hideSetting')} checked={hidden} disabled={busy} onChange={(value) => void change(value)} />
    </SettingRow>
    {failed && <p className="settings-warning" role="alert">{t('age.saveError')}</p>}
  </>;
}
