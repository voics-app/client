/** Local-only browser regression composition. No session boot, gateway or external service. */
import '@renderer/infrastructure/brand/installBrand';
import '@renderer/infrastructure/storage/installBrowserStorage';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@renderer/interface/shared/theme/base.css';
import '@renderer/interface/shared/theme/ui.css';
import '@renderer/interface/shared/theme/app.css';
import '@renderer/interface/shared/theme/access.css';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { User } from '@discordy/core/contracts/rest';
import { useUiStore, type SettingsTarget } from '@discordy/core/application/stores/uiStore';
import { LocaleProvider } from '@renderer/interface/shared/i18n';
import { createRuntime } from '@renderer/interface/app/runtime';
import { SettingsHost } from '@renderer/interface/features/settings/SettingsHost';
import { DialogHost } from '@renderer/interface/features/shell/DialogHost';
import { Toasts } from '@renderer/interface/shared/ui/Toasts';

const runtime = createRuntime({ version: 'fixture', platform: 'web', e2eTest: true, updateFeedUrl: '', connection: { id: 'local', apiUrl: location.origin, cdnUrl: `${location.origin}/cdn`, gatewayUrl: `ws://${location.host}` } });
const user: User = { id: '7', username: 'sam', global_name: 'Sam مرحبا', avatar: null, bio: 'Original words remain original. مرحبا 👩🏽‍💻', pronouns: 'they / them', theme_colors: [0x457b9d, 0x25335c] };
useSessionStore.setState({ user, status: 'ready', settings: { default_delivery_mode: 'standard', locale: 'nl' } });
useGuildStore.setState({ guilds: { '1': { id: '1', name: 'Samenwerken met vrienden مرحبا', icon: null, owner_id: '7', roles: [], emojis: [] } } });
useUiStore.getState().openSettings({ kind: 'user', tab: 'language' });
Object.assign(window, { localizationFixture: {
  show: (settings: SettingsTarget) => useUiStore.getState().openSettings(settings),
  locale: (locale: string) => useSessionStore.getState().setSettings({ locale }),
} });
createRoot(document.getElementById('root')!).render(<LocaleProvider><QueryClientProvider client={runtime.queryClient}><SettingsHost /><DialogHost /><Toasts /></QueryClientProvider></LocaleProvider>);
