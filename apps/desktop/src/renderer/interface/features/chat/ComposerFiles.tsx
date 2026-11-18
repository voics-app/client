import { useI18n } from '../../shared/i18n';
import { Eye, EyeSlash, File as FileIcon, TextAa, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { ALT_TEXT_MAX, displayFilename, isSpoilerName, withoutSpoilerPrefix, withSpoilerPrefix } from '@discordy/core/domain/media';
import { formatBytes } from '@discordy/core/domain/media';

/** Alt text of the attached files, by file object. */
export type Descriptions = ReadonlyMap<File, string>;

interface Props {
  files: File[];
  descriptions: Descriptions;
  /** Alt text is only sent to the server in standard chats. */
  allowDescriptions: boolean;
  onChange(files: File[], descriptions: Descriptions): void;
}

/** A copy of `file` under a new name (File names are immutable). */
function renamed(file: File, name: string): File {
  return new File([file], name, { type: file.type, lastModified: file.lastModified });
}

/** The chips above the composer: preview, Spoiler toggle, Edit description (alt text) and Remove. */
export function ComposerFiles({ files, descriptions, allowDescriptions, onChange }: Props) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<File | null>(null);
  const previews = useMemo(() => new Map(files.filter((f) => f.type.startsWith('image/')).map((f) => [f, URL.createObjectURL(f)])), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const replace = (index: number, next: File | null) => {
    const old = files[index]!;
    const nextDescriptions = new Map(descriptions);
    const description = nextDescriptions.get(old);
    nextDescriptions.delete(old);
    if (next && description) nextDescriptions.set(next, description);
    const nextFiles = next ? files.map((f, i) => (i === index ? next : f)) : files.filter((_, i) => i !== index);
    onChange(nextFiles, nextDescriptions);
    if (editing === old) setEditing(next);
  };
  const toggleSpoiler = (index: number) => {
    const file = files[index]!;
    replace(index, renamed(file, isSpoilerName(file.name) ? withoutSpoilerPrefix(file.name) : withSpoilerPrefix(file.name)));
  };
  const setDescription = (file: File, text: string) => {
    const next = new Map(descriptions);
    if (text) next.set(file, text.slice(0, ALT_TEXT_MAX));
    else next.delete(file);
    onChange(files, next);
  };

  if (files.length === 0) return null;
  return (
    <ul className="composer-files">
      {files.map((file, i) => {
        const spoiler = isSpoilerName(file.name);
        const preview = previews.get(file);
        const description = descriptions.get(file) ?? '';
        const name = displayFilename(file.name);
        return (
          <li key={`${file.name}-${file.size}-${i}`} className={spoiler ? 'is-spoiler' : ''}>
            <span className="composer-file-thumb">
              {preview ? <img src={preview} alt={description} /> : <FileIcon size={26} weight="light" />}
            </span>
            <span className="composer-file-name" title={name}>{name}</span>
            <span className="composer-file-size tnum">{formatBytes(file.size, locale)}</span>
            <span className="composer-file-actions">
              <button type="button" aria-pressed={spoiler} aria-label={t(spoiler ? 'files.removeSpoiler' : 'files.markSpoiler', { name })} title={t('composer.spoiler')} className={spoiler ? 'is-on' : ''} onClick={() => toggleSpoiler(i)}>
                {spoiler ? <EyeSlash size={14} /> : <Eye size={14} />}
              </button>
              {allowDescriptions && (
                <button type="button" aria-label={t('files.editDescription', { name })} title={t('files.altText')} className={description ? 'is-on' : ''} onClick={() => setEditing(editing === file ? null : file)}>
                  <TextAa size={14} />
                </button>
              )}
              <button type="button" aria-label={t('files.remove', { name })} title={t('common.remove')} onClick={() => replace(i, null)}><X size={14} /></button>
            </span>
            {editing === file && (
              <input
                className="composer-file-alt"
                autoFocus
                maxLength={ALT_TEXT_MAX}
                placeholder={t('files.describe')}
                aria-label={t('files.description', { name })}
                value={description}
                onChange={(e) => setDescription(file, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
                onBlur={() => setEditing(null)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
