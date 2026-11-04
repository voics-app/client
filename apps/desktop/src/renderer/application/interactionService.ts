/** Discovers application commands and creates interactions (commands, components, modal submits) through the API. */
import {
  InteractionType,
  type ApplicationCommand,
  type Channel,
  type Message,
  type MessageComponent,
} from '@discordy/core/contracts/rest';
import { buildContextCommandData, extractContextCommands, type ContextCommand } from '@discordy/core/domain/contextCommands';
import {
  buildCommandData,
  buildComponentData,
  buildModalSubmitData,
  flattenCommands,
  validateValues,
  type OptionValues,
  type SlashEntry,
} from '@discordy/core/domain/slashCommand';
import type { ApiPort } from './ports/api';
import { useGuildStore } from './stores/guildStore';
import { DM_SCOPE, useInteractionStore } from './stores/interactionStore';

export interface CandidateApplication {
  id: string;
  name: string;
}

export class InteractionService {
  constructor(private readonly api: ApiPort) {}

  /** Returns the commands invokable in a guild from the per-guild cache, fetching the command index on a miss. */
  async loadGuildCommands(guildId: string): Promise<SlashEntry[]> {
    const store = useInteractionStore.getState();
    const cached = store.commands[guildId];
    if (cached) return cached;
    const index = await this.api.commandIndex(guildId);
    for (const app of index.applications) store.setAppName(app.id, app.name);
    const entries = flattenCommands(index.application_commands);
    store.setContextCommands(guildId, extractContextCommands(index.application_commands, useInteractionStore.getState().appNames));
    store.setCommands(guildId, entries);
    return entries;
  }

  /**
   * Loads the global commands of every application that could serve a direct message: the caller's own
   * applications plus the recipient bots. Applications that refuse the request are skipped.
   */
  async loadDirectCommands(bots: CandidateApplication[]): Promise<SlashEntry[]> {
    const store = useInteractionStore.getState();
    const own = await this.api.applications().catch(() => []);
    const apps = new Map<string, string>();
    for (const c of bots) apps.set(c.id, c.name);
    for (const a of own) apps.set(a.id, a.name);
    for (const [id, name] of apps) store.setAppName(id, name);

    const fetched = await Promise.all(
      [...apps.keys()].map((id) => this.api.globalCommands(id).catch((): ApplicationCommand[] => [])),
    );
    const unique = new Map<string, ApplicationCommand>();
    for (const c of fetched.flat()) unique.set(c.id, c);
    const entries = flattenCommands([...unique.values()]);
    store.setContextCommands(DM_SCOPE, extractContextCommands([...unique.values()], useInteractionStore.getState().appNames));
    store.setCommands(DM_SCOPE, entries);
    return entries;
  }

  async invoke(channel: Channel, entry: SlashEntry, values: OptionValues): Promise<string> {
    const errors = validateValues(entry.options, values);
    const first = Object.entries(errors)[0];
    if (first) throw new Error(`${first[0]}: ${first[1]}`);
    const applicationId = entry.command.application_id;
    const { id } = await this.api.createInteraction({
      type: InteractionType.APPLICATION_COMMAND,
      application_id: applicationId,
      channel_id: channel.id,
      ...(channel.guild_id ? { guild_id: channel.guild_id } : {}),
      data: buildCommandData(entry, values),
    });
    const store = useInteractionStore.getState();
    store.addPending({
      id,
      channelId: channel.id,
      applicationId,
      appName: store.appNames[applicationId] ?? 'Application',
      label: entry.label,
      startedAt: Date.now(),
    });
    return id;
  }

  /** Runs a USER or MESSAGE command on `targetId`; the bot's answer arrives as a message (type 23) or a modal. */
  async invokeContext(channel: Channel, command: ContextCommand, targetId: string): Promise<string> {
    const { id } = await this.api.createInteraction({
      type: InteractionType.APPLICATION_COMMAND,
      application_id: command.applicationId,
      channel_id: channel.id,
      ...(channel.guild_id ? { guild_id: channel.guild_id } : {}),
      data: buildContextCommandData(command, targetId),
    });
    const store = useInteractionStore.getState();
    store.addPending({ id, channelId: channel.id, applicationId: command.applicationId, appName: command.appName, label: command.name, startedAt: Date.now() });
    return id;
  }

  async pressComponent(message: Message, component: Pick<MessageComponent, 'type' | 'custom_id'>, values?: string[]): Promise<void> {
    const applicationId = message.application_id ?? message.author.id;
    const guildId = message.guild_id ?? useGuildStore.getState().channels[message.channel_id]?.guild_id;
    const { id } = await this.api.createInteraction({
      type: InteractionType.MESSAGE_COMPONENT,
      application_id: applicationId,
      channel_id: message.channel_id,
      ...(guildId ? { guild_id: guildId } : {}),
      message_id: message.id,
      data: buildComponentData(component, values),
    });
    useInteractionStore.getState().rememberApplication(id, applicationId);
  }

  async submitModal(fields: Record<string, string>): Promise<void> {
    const store = useInteractionStore.getState();
    const modal = store.modal;
    if (!modal) return;
    const guildId = useGuildStore.getState().channels[modal.channelId]?.guild_id;
    const { id } = await this.api.createInteraction({
      type: InteractionType.MODAL_SUBMIT,
      application_id: modal.applicationId,
      channel_id: modal.channelId,
      ...(guildId ? { guild_id: guildId } : {}),
      data: buildModalSubmitData(modal.customId, fields),
    });
    store.rememberApplication(id, modal.applicationId);
    store.closeModal();
  }
}
