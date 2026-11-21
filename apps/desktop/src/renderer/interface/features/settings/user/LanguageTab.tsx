import { useId, useRef, useState } from 'react';
import { LANGUAGES, createI18n, type LanguageChoice } from '@discordy/core/domain/i18n';
import { saveLanguage } from '@discordy/core/application/language';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../../../app/runtime';
import { useI18n } from '../../../shared/i18n';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { Field, Select } from '../../../shared/ui/Form';
import './language.css';

export function LanguageTab() {
  const { t, language } = useI18n();
  const storedLocale = useSessionStore((state) => state.settings.locale);
  const [choice, setChoice] = useState<LanguageChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'failed' | null>(null);
  const pending = useRef(false);
  const helpId = useId();
  const selected = choice ?? language;
  const dirty = choice !== null && choice !== storedLocale;
  const preview = createI18n(selected);
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await saveLanguage(getRuntime().api, selected);
      setChoice(null);
      setFeedback('saved');
    } catch {
      setFeedback('failed');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <form className="settings-page language-settings" onSubmit={(event) => { event.preventDefault(); if (dirty) void save(); }} aria-busy={busy}>
      <h1>{t('settings.language')}</h1>
      <p className="page-sub">{t('language.description')}</p>
      <Field label={t('language.label')}>
        {(id) => <Select id={id} value={selected} disabled={busy} aria-describedby={helpId} onChange={(event) => { setChoice(event.target.value as LanguageChoice); setFeedback(null); }}>
          {LANGUAGES.map((entry) => <option key={entry.value} value={entry.value} lang={entry.value}>{entry.name}</option>)}
        </Select>}
      </Field>
      <p id={helpId} className="setting-desc">{t('language.content')}</p>
      <UnsavedBar dirty={dirty || busy} saving={busy} onReset={() => { setChoice(null); setFeedback(null); }} onSave={() => void save()} />
      {feedback === 'failed' && <p role="alert" className="field-error">{t('language.failed')}</p>}
      {feedback === 'saved' && <p role="status" className="setting-desc">{t('language.saved')}</p>}
      <h3>{t('language.preview')}</h3>
      <dl className="language-preview" lang={preview.locale}>
        <div><dt>{t('language.date')}</dt><dd>{preview.date(new Date(), { dateStyle: 'long' })}</dd></div>
        <div><dt>{t('language.number')}</dt><dd>{preview.number(1234.5)}</dd></div>
        <div><dt>{t('language.relative')}</dt><dd>{preview.relative(-2, 'minute')}</dd></div>
      </dl>
      <p className="setting-desc">{t('language.coverage')}</p>
      <p className="setting-desc">{t('language.system')}</p>
    </form>
  );
}
