export interface GuildScheduledEvent {
  id: string;
  guild_id: string;
  creator_id: string | null;
  channel_id: string | null;
  name: string;
  description: string | null;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  status: 1 | 2 | 3 | 4;
  entity_type: 1 | 2 | 3;
  entity_metadata: { location: string } | null;
  image: string | null;
  user_count: number;
}

export interface CreateGuildScheduledEvent {
  name: string;
  description?: string | null;
  scheduled_start_time: string;
  scheduled_end_time?: string | null;
  entity_type: 1 | 2 | 3;
  channel_id?: string | null;
  entity_metadata?: { location: string } | null;
  image?: string | null;
}

export interface GuildScheduledEventStart {
  guild_id: string;
  guild_scheduled_event_id: string;
  scheduled_start_time: string;
  revision: number;
  dedupe_key: string;
}
