import { useI18n } from '../../shared/i18n';
import { AppWindow, Desktop, ShieldWarning, SpeakerHigh, Television } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { VIDEO_PRESETS, type VideoPresetId } from '@discordy/core/domain/videoPresets';
import type { CaptureSource } from '@shared/ipc';
import { bridge } from '../../app/bridge';
import { startShare } from '../../app/voiceActions';
import { Button } from '../../shared/ui/Button';
import { Segmented, Switch } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { Spinner } from '../../shared/ui/Spinner';

const isWindows = navigator.userAgent.includes('Windows');

/** Our own source picker: screens and windows with live thumbnails, quality presets and system audio. */
export function ScreenPickerDialog() {
  const { t: msg, catalogText } = useI18n();
  const close = () => useUiStore.getState().openDialog(null);
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [audio, setAudio] = useState(isWindows);
  const preset = useVoiceStore((s) => s.streamPreset);
  const setSelf = useVoiceStore((s) => s.setSelf);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ reason: string; message?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = (await bridge?.capture.listSources().catch(() => [])) ?? [];
      if (!alive) return;
      setSources(list);
      setSelected((cur) => cur ?? list.find((s) => s.kind === 'screen')?.id ?? null);
    };
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const shown = (sources ?? []).filter((s) => s.kind === tab);

  const go = async () => {
    if (!selected) return;
    setBusy(true);
    setProblem(null);
    const result = await startShare({ sourceId: selected, audio, preset });
    setBusy(false);
    if (result.ok) close();
    else if (result.reason !== 'cancelled') setProblem({ reason: result.reason, message: result.message });
  };

  return (
    <Modal
      open
      onClose={close}
      width={760}
      title={msg("settings.screenpickerdialog.share.your.screen")}
      description={msg("settings.screenpickerdialog.choose.what.to.share.and.how.it.should.look")}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={!selected} onClick={() => void go()} trailing={<Television size={16} weight="fill" />}>{msg("settings.screenpickerdialog.go.live")}</Button>
        </>
      }
    >
      <Segmented label={msg("settings.screenpickerdialog.source.type")} value={tab} onChange={setTab} options={[{ value: 'screen', label: <><Desktop size={15} /> {msg("settings.screenpickerdialog.screens")}</> }, { value: 'window', label: <><AppWindow size={15} /> {msg("settings.screenpickerdialog.windows")}</> }]} />
      {sources === null ? (
        <div className="picker-loading"><Spinner /> {msg("settings.screenpickerdialog.looking.for.sources")}</div>
      ) : shown.length === 0 ? (
        <p className="picker-empty">{bridge ? msg("settings.screenpickerdialog.no.sources.found") : msg("settings.screenpickerdialog.screen.capture.needs.the.desktop.app")}</p>
      ) : (
        <ul className="source-grid" role="listbox" aria-label={msg("settings.screenpickerdialog.capture.sources")}>
          {shown.map((s) => (
            <li key={s.id} role="option" aria-selected={selected === s.id}>
              <button type="button" className={`source${selected === s.id ? ' is-selected' : ''}`} onClick={() => setSelected(s.id)}>
                <img src={s.thumbnailDataUrl} alt="" draggable={false} />
                <span className="source-name">
                  {s.appIconDataUrl && <img src={s.appIconDataUrl} alt="" width={16} height={16} />}
                  <span>{s.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="picker-options">
        <div>
          <p className="setting-title">{msg("settings.screenpickerdialog.quality")}</p>
          <Segmented label={msg("settings.screenpickerdialog.quality.preset")} value={preset} onChange={(v: VideoPresetId) => setSelf({ streamPreset: v })} options={VIDEO_PRESETS.map((p) => ({ value: p.id, label: catalogText(p.label).replace(' · ', ' ') }))} />
        </div>
        <div className="picker-audio">
          <div>
            <p className="setting-title"><SpeakerHigh size={14} /> {msg("settings.screenpickerdialog.share.system.audio")}</p>
            <p className="setting-desc">{isWindows ? msg("settings.screenpickerdialog.captures.what.plays.on.this.pc.through.windows.loopback") : msg("settings.screenpickerdialog.system.audio.capture.is.only.available.on.windows")}</p>
          </div>
          <Switch label={msg("settings.screenpickerdialog.share.system.audio")} checked={audio && isWindows} disabled={!isWindows} onChange={setAudio} />
        </div>
      </div>
      <p className="drm-note"><ShieldWarning size={14} /> {msg('voice.protected')}</p>
      {problem && (
        <div className="picker-problem" role="alert">
          <ShieldWarning size={18} weight="fill" />
          <div>
            <strong>{problem.reason === 'protected_content' ? msg("settings.screenpickerdialog.this.source.looks.protected") : msg("settings.screenpickerdialog.could.not.start.sharing")}</strong>
            <p>{problem.reason === 'protected_content' ? msg("settings.screenpickerdialog.we.only.captured.black.frames.drm.protected.content.cannot") : problem.message ? catalogText(problem.message) : null}</p>
            {problem.reason === 'protected_content' && (
              <Button size="sm" onClick={() => { close(); useUiStore.getState().setSidePanel({ kind: 'watch' }); }}>{msg("settings.screenpickerdialog.open.watch.together")}</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
