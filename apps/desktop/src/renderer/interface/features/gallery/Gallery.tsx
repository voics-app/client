import { Gear, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { usePrefsStore, type AccentId, type ThemeId } from '@discordy/core/application/stores/prefsStore';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Checkbox, Field, Input, Segmented, Select, Slider, Switch } from '../../shared/ui/Form';
import { IconButton } from '../../shared/ui/IconButton';
import { Count, EmptyState, Eyebrow, Kbd, Skeleton } from '../../shared/ui/Misc';
import { Modal } from '../../shared/ui/Modal';
import { Spinner } from '../../shared/ui/Spinner';
import { ModeBadge } from '../privacy/ModeBadge';

const THEMES: ThemeId[] = ['dark', 'oled', 'light'];
const ACCENTS: AccentId[] = ['iris', 'aurora', 'ember', 'rose', 'citrine', 'sky'];
const SURFACES = ['--bg-0', '--bg-1', '--bg-2', '--bg-3', '--accent', '--accent-soft', '--mode-standard', '--mode-ephemeral', '--mode-p2p', '--success', '--warning', '--danger'];

/** Visual review sheet, reachable at `#/__gallery`. Every primitive in every theme and accent. */
export function Gallery() {
  const { theme, accent, set } = usePrefsStore();
  const [on, setOn] = useState(true);
  const [value, setValue] = useState(0.4);
  const [open, setOpen] = useState(false);
  const [seg, setSeg] = useState('a');
  const choose = <T extends string>(key: 'theme' | 'accent', v: T) => {
    set(key, v as never);
    document.documentElement.dataset[key] = v;
  };
  return (
    <div className="gallery">
      <header>
        <div>
          <Eyebrow>Nightglass</Eyebrow>
          <h1 style={{ marginTop: 8 }}>Component gallery</h1>
        </div>
        <div className="row">
          <Segmented label="Theme" value={theme} onChange={(v) => choose('theme', v)} options={THEMES.map((t) => ({ value: t, label: t }))} />
          <Segmented label="Accent" value={accent} onChange={(v) => choose('accent', v)} options={ACCENTS.map((a) => ({ value: a, label: a }))} />
        </div>
      </header>
      <section>
        <h2>Surfaces and tokens</h2>
        <div className="swatches">
          {SURFACES.map((token) => (
            <div key={token} className="swatch" style={{ background: `var(${token})` }}>{token}</div>
          ))}
        </div>
      </section>
      <section>
        <h2>Buttons</h2>
        <div className="row">
          <Button variant="primary">Primary</Button>
          <Button variant="primary" trailing={<Plus size={14} />}>With trailing</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Settings"><Gear size={20} /></IconButton>
          <IconButton label="Active" active><Gear size={20} weight="fill" /></IconButton>
        </div>
      </section>
      <section>
        <h2>Delivery modes</h2>
        <div className="row">
          <ModeBadge mode="standard" />
          <ModeBadge mode="ephemeral" />
          <ModeBadge mode="p2p" />
          <ModeBadge mode="standard" compact />
          <ModeBadge mode="ephemeral" compact />
          <ModeBadge mode="p2p" compact />
        </div>
      </section>
      <section>
        <h2>Avatars</h2>
        <div className="row">
          <Avatar name="Ada Lovelace" size={48} status="online" />
          <Avatar name="Grace Hopper" size={48} status="idle" />
          <Avatar name="Linus T" size={48} status="dnd" />
          <Avatar name="Margaret H" size={48} status="offline" />
          <Avatar name="Speaker" size={48} speaking={0.8} />
          <Avatar name="Server" size={48} square />
          <Avatar name="Bot" size={48} bot />
        </div>
      </section>
      <section>
        <h2>Form controls</h2>
        <div className="panel stack" style={{ maxWidth: 420 }}>
          <Field label="Text input" hint="Helper text sits below.">{(id) => <Input id={id} placeholder="Type here" />}</Field>
          <Field label="Invalid" error="Something is wrong">{(id) => <Input id={id} invalid defaultValue="oops" />}</Field>
          <Field label="Select">{(id) => <Select id={id}><option>One</option><option>Two</option></Select>}</Field>
          <Switch label="Switch" checked={on} onChange={setOn} />
          <Checkbox label="Checkbox" checked={on} onChange={setOn} />
          <Slider label="Slider" value={value} onChange={setValue} format={(v) => `${Math.round(v * 100)}%`} />
          <Segmented label="Segmented" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }, { value: 'c', label: 'Three' }]} />
        </div>
      </section>
      <section>
        <h2>Feedback</h2>
        <div className="row">
          <Spinner size={20} /> <Count value={3} /> <Count value={120} tone="danger" /> <Kbd>Ctrl K</Kbd>
          <Skeleton width={160} height={14} />
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
        </div>
        <EmptyState icon={<Gear size={32} weight="light" />} title="Empty state" body="Calm, short, and with a next step." action={<Button variant="primary">Do the thing</Button>} />
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title="Double-bezel dialog" description="Outer shell, inner core, concentric radii." footer={<Button variant="primary" onClick={() => setOpen(false)}>Done</Button>}>
        <p>Content sits on its own elevation inside a tinted shell.</p>
      </Modal>
    </div>
  );
}
