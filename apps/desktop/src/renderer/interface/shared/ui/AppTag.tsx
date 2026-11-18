import { useI18n } from '../i18n';
/** Small "APP" badge shown beside bot and application names. */
export function AppTag() {
  const { t: msg } = useI18n();
  return (
    <span className="member-tag app-tag" title={msg("settings.apptag.application")}>
      {msg("settings.apptag.app")} </span>
  );
}
