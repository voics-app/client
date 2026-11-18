// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { closeSettings, useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import type { GuildTemplate } from '@discordy/core/contracts/rest';
import { ServerTemplate } from '@renderer/interface/features/settings/server/ServerTemplate';
import { CreateGuildDialog, TemplateLinkDialog } from '@renderer/interface/features/shell/CreateGuildDialog';
import { SettingsCloseButton } from '@renderer/interface/features/settings/SettingsCloseButton';
import type * as UiActions from '@renderer/interface/app/actions';

const fixture = vi.hoisted(() => ({
  api: {
    guildTemplates: vi.fn(), createGuildTemplate: vi.fn(), modifyGuildTemplate: vi.fn(),
    syncGuildTemplate: vi.fn(), deleteGuildTemplate: vi.fn(), builtinGuildTemplates: vi.fn(),
    guildTemplate: vi.fn(), createGuildFromTemplate: vi.fn(), createGuild: vi.fn(),
  },
  copyText: vi.fn(), openGuild: vi.fn(),
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: fixture.api }) }));
vi.mock('@renderer/interface/app/navigation', () => ({ openGuild: fixture.openGuild }));
vi.mock('@renderer/interface/app/actions', async (importOriginal) => ({
  ...await importOriginal<typeof UiActions>(),
  copyText: fixture.copyText,
}));

const template: GuildTemplate = {
  code: 'shared-123', name: 'Study crew', description: 'Start together', usage_count: 2,
  creator: null, creator_id: null, source_guild_id: '1', created_at: '', updated_at: '', is_dirty: true,
  serialized_source_guild: {
    name: 'Source', description: null, afk_channel_id: null, system_channel_id: null,
    roles: [{ id: 0, name: '@everyone', permissions: '0', color: 0, hoist: false, mentionable: false }],
    channels: [{ id: 1, type: 0, name: 'general', position: 0, parent_id: null, topic: null, nsfw: false, permission_overwrites: [] }],
  },
};
const builtins = ['gaming', 'friends', 'study-group', 'community', 'creators'].map((code) => ({ ...template, code: `builtin-${code}`, name: code, is_dirty: false }));

function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  fixture.api.guildTemplates.mockResolvedValue([template]);
  fixture.api.builtinGuildTemplates.mockResolvedValue(builtins);
  fixture.api.guildTemplate.mockResolvedValue(template);
  fixture.api.createGuildFromTemplate.mockResolvedValue({ id: 'created', name: 'New crew', roles: [], channels: [] });
  useUiStore.setState({ dialog: null, settings: null, toasts: [] });
  useUnsavedStore.setState({ sources: {}, shake: 0, escBlocked: false });
});
afterEach(cleanup);

describe('template management', () => {
  it('keeps metadata drafts when closing or switching settings until reset', async () => {
    const settings = { kind: 'server', guildId: '1', tab: 'template' } as const;
    useUiStore.setState({ settings });
    mount(<><ServerTemplate guildId="1" /><SettingsCloseButton onClose={() => closeSettings()} /></>);
    const name = await screen.findByLabelText('Template name');
    fireEvent.change(name, { target: { value: 'Unsaved name' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unsaved description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(useUiStore.getState().settings).toEqual(settings);
    expect(useUnsavedStore.getState().requestLeave()).toBe(false);
    expect((name as HTMLInputElement).value).toBe('Unsaved name');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((name as HTMLInputElement).value).toBe('Study crew');
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Start together');
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(useUiStore.getState().settings).toBeNull();
  });

  it('preserves an edited draft when refreshed metadata arrives', async () => {
    const client = mount(<ServerTemplate guildId="1" />);
    const name = await screen.findByLabelText('Template name');
    fireEvent.change(name, { target: { value: 'My draft' } });
    fixture.api.guildTemplates.mockResolvedValue([{ ...template, name: 'Updated elsewhere' }]);
    await client.invalidateQueries({ queryKey: ['guild', '1', 'templates'] });
    await waitFor(() => expect(client.getQueryData<GuildTemplate[]>(['guild', '1', 'templates'])?.[0]?.name).toBe('Updated elsewhere'));
    expect((name as HTMLInputElement).value).toBe('My draft');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((name as HTMLInputElement).value).toBe('Updated elsewhere');
  });

  it('keeps a rejected save editable and guarded, then clears the draft after retry', async () => {
    fixture.api.modifyGuildTemplate.mockRejectedValueOnce(new Error('Missing permissions.')).mockResolvedValueOnce({ ...template, name: 'Retry name' });
    mount(<ServerTemplate guildId="1" />);
    const name = await screen.findByLabelText('Template name');
    fireEvent.change(name, { target: { value: 'Retry name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useUiStore.getState().toasts).toEqual(expect.arrayContaining([
      expect.objectContaining({ tone: 'danger', title: 'Could not save the template', body: 'Missing permissions.' }),
    ])));
    expect((name as HTMLInputElement).value).toBe('Retry name');
    expect((name as HTMLInputElement).disabled).toBe(false);
    expect(useUnsavedStore.getState().requestLeave()).toBe(false);
    fixture.api.guildTemplates.mockResolvedValue([{ ...template, name: 'Retry name' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull());
    expect(useUnsavedStore.getState().requestLeave()).toBe(true);
    expect(fixture.api.modifyGuildTemplate).toHaveBeenCalledTimes(2);
  });

  it('keeps fields and navigation locked until a successful save is refreshed', async () => {
    let finishRefresh!: (templates: GuildTemplate[]) => void;
    const refreshing = new Promise<GuildTemplate[]>((resolve) => { finishRefresh = resolve; });
    fixture.api.modifyGuildTemplate.mockResolvedValue({ ...template, name: 'Saved name' });
    mount(<ServerTemplate guildId="1" />);
    const name = await screen.findByLabelText('Template name');
    fixture.api.guildTemplates.mockReturnValueOnce(refreshing);
    fireEvent.change(name, { target: { value: 'Saved name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fixture.api.guildTemplates).toHaveBeenCalledTimes(2));
    expect((name as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true);
    expect(useUnsavedStore.getState().requestLeave()).toBe(false);
    finishRefresh([{ ...template, name: 'Saved name' }]);
    await waitFor(() => expect((name as HTMLInputElement).disabled).toBe(false));
    expect((name as HTMLInputElement).value).toBe('Saved name');
    expect(useUnsavedStore.getState().requestLeave()).toBe(true);
  });

  it('copies a web link, saves metadata, syncs a dirty snapshot and deletes it', async () => {
    mount(<ServerTemplate guildId="1" />);
    await screen.findByText(/This server has changed/);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(fixture.copyText).toHaveBeenCalledWith(expect.stringContaining('/template.html?code=shared-123'), 'Template link copied');
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Renamed' } });
    fixture.api.modifyGuildTemplate.mockResolvedValue({ ...template, name: 'Renamed' });
    fixture.api.guildTemplates.mockResolvedValue([{ ...template, name: 'Renamed' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fixture.api.modifyGuildTemplate).toHaveBeenCalledWith('1', 'shared-123', { name: 'Renamed', description: 'Start together' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
    fixture.api.syncGuildTemplate.mockResolvedValue({ ...template, is_dirty: false });
    fixture.api.guildTemplates.mockResolvedValue([{ ...template, is_dirty: false }]);
    fireEvent.click(screen.getByRole('button', { name: 'Sync with this server' }));
    await waitFor(() => expect(screen.queryByText(/This server has changed/)).toBeNull());
    expect(fixture.api.syncGuildTemplate).toHaveBeenCalledWith('1', 'shared-123');
    fixture.api.deleteGuildTemplate.mockResolvedValue(undefined);
    fixture.api.guildTemplates.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete template' }));
    await screen.findByRole('button', { name: 'Generate template link' });
    expect(fixture.api.deleteGuildTemplate).toHaveBeenCalledWith('1', 'shared-123');
  });

  it('retries a failed load before offering a create action', async () => {
    fixture.api.guildTemplates.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce([]);
    mount(<ServerTemplate guildId="1" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Connection lost');
    expect(screen.queryByRole('button', { name: 'Generate template link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.change(await screen.findByLabelText('Template name'), { target: { value: 'My template' } });
    fixture.api.createGuildTemplate.mockResolvedValue(template);
    fireEvent.click(screen.getByRole('button', { name: 'Generate template link' }));
    await waitFor(() => expect(fixture.api.createGuildTemplate).toHaveBeenCalledWith('1', { name: 'My template', description: null }));
  });
});

describe('create from template', () => {
  it.each(builtins)('creates from $code and opens the new server', async (builtin) => {
    mount(<CreateGuildDialog />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(builtin.name) }));
    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'New crew' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    await waitFor(() => expect(fixture.api.createGuildFromTemplate).toHaveBeenCalledWith(builtin.code, { name: 'New crew' }));
    expect(fixture.openGuild).toHaveBeenCalledWith('created');
    expect(useGuildStore.getState().guilds.created?.name).toBe('New crew');
  });

  it('accepts a web link and opens the saved-snapshot preview', async () => {
    mount(<CreateGuildDialog />);
    fireEvent.change(screen.getByLabelText('Have a template link?'), { target: { value: 'https://example.test/template.html?code=shared-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(useUiStore.getState().dialog).toEqual({ kind: 'template', code: 'shared-123' });
  });

  it('retries a transient preview error and creates from the recovered template', async () => {
    fixture.api.guildTemplate.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(template);
    mount(<TemplateLinkDialog code="shared-123" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Create a server from Study crew' });
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'New crew' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    await waitFor(() => expect(fixture.api.createGuildFromTemplate).toHaveBeenCalledWith('shared-123', { name: 'New crew' }));
  });

  it('does not offer creation or retry for a deleted template', async () => {
    fixture.api.guildTemplate.mockRejectedValueOnce(Object.assign(new Error('Unknown template'), { code: 10057 }));
    mount(<TemplateLinkDialog code="deleted-code" />);
    expect((await screen.findByRole('alert')).textContent).toContain('invalid or no longer exists');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Create server' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.api.createGuildFromTemplate).not.toHaveBeenCalled();
  });

  it('retains the server name after failed creation and opens only the successful retry', async () => {
    fixture.api.createGuildFromTemplate.mockRejectedValueOnce(new Error('Try again later.')).mockResolvedValueOnce({ id: 'created', name: 'New crew', roles: [], channels: [] });
    mount(<TemplateLinkDialog code="shared-123" />);
    await screen.findByRole('heading', { name: 'Create a server from Study crew' });
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    const name = screen.getByLabelText('Server name');
    fireEvent.change(name, { target: { value: 'New crew' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Try again later.');
    expect((name as HTMLInputElement).value).toBe('New crew');
    expect(fixture.openGuild).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create server' }));
    await waitFor(() => expect(fixture.openGuild).toHaveBeenCalledWith('created'));
    expect(fixture.api.createGuildFromTemplate).toHaveBeenCalledTimes(2);
  });
});
