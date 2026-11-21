import { useI18n } from '../../../shared/i18n';
import { Copy, DownloadSimple } from '@phosphor-icons/react';
import type { BackupCode } from '@discordy/core/contracts/rest';
import { backupCodesFile } from '@discordy/core/domain/accountSecurity';
import { BRAND } from '@shared/brand';
import { copyText } from '../../../app/actions';
import { Button } from '../../../shared/ui/Button';

export function BackupCodesList({ codes, username }: { codes: BackupCode[]; username: string }) {
  const { t: msg, locale } = useI18n();
  const plain = codes.flatMap((c) => (c.code ? [c.code] : []));
  const download = () => {
    const url = URL.createObjectURL(new Blob([backupCodesFile(plain, username, BRAND.displayName, locale)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${BRAND.displayName.toLowerCase()}-backup-codes.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="stack">
      <ul className="backup-codes mono">
        {codes.map((c, i) => <li key={c.code ?? i} className={c.consumed ? 'is-used' : undefined}>{c.code ?? (c.consumed ? msg("settings.backupcodeslist.used") : msg("settings.backupcodeslist.unused"))}</li>)}
      </ul>
      {plain.length > 0 && (
        <div className="row">
          <Button icon={<Copy size={16} />} onClick={() => void copyText(plain.join('\n'), msg("settings.backupcodeslist.backup.codes.copied"))}>{msg("settings.backupcodeslist.copy")}</Button>
          <Button icon={<DownloadSimple size={16} />} onClick={download}>{msg("settings.backupcodeslist.download")}</Button>
        </div>
      )}
    </div>
  );
}
