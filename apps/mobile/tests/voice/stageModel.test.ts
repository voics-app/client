import type { RemoteStream } from '@discordy/core/application/stores/voiceStore';
import { buildTiles, stageView, tileKey } from '../../src/voice/stageModel';
import type { NativeVideoStream } from '../../src/voice/nativeVoice';
import type { ParticipantRow } from '../../src/voice/voiceModel';

const row = (userId: string, self = false): ParticipantRow => ({
  userId,
  name: userId,
  user: { id: userId, avatar: null, username: userId, global_name: null },
  self,
  muted: false,
  deafened: false,
  speaking: false,
});
const stream = (id: string) => ({ id, getTracks: () => [], getVideoTracks: () => [], toURL: () => id }) as unknown as NativeVideoStream;
const remote = (userId: string, kind: 'camera' | 'screen', s: NativeVideoStream): RemoteStream => ({ userId, kind, stream: s as never });

const base = { remote: [], localCamera: null, screenKeys: [], watching: [] };

describe('buildTiles', () => {
  it('gives each person a tile: their camera when they send one, their avatar otherwise', () => {
    const cam = stream('cam-u2');
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2'), row('u3')], remote: [remote('u2', 'camera', cam)] });
    expect(tiles.map((t) => [t.key, t.kind, t.hasVideo])).toEqual([
      ['me:main', 'avatar', false],
      ['u2:main', 'camera', true],
      ['u3:main', 'avatar', false],
    ]);
    expect(tiles[1]!.stream).toBe(cam);
  });

  it('shows your own camera on your tile', () => {
    const mine = stream('mine');
    const tiles = buildTiles({ ...base, rows: [row('me', true)], localCamera: mine });
    expect(tiles[0]).toMatchObject({ kind: 'camera', hasVideo: true, isSelf: true, stream: mine });
  });

  it('marks your own share without recursively rendering the captured call screen', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true)], localScreen: stream('screen') });
    expect(tiles.find((tile) => tile.key === 'me:screen')).toMatchObject({ kind: 'screen', isSelf: true, watchable: false, stream: null });
    expect(stageView(tiles, null).mode).toBe('grid');
  });

  it('adds a screen tile for a remote share, without its picture until it is watched', () => {
    const screen = stream('screen');
    const key = tileKey('u2', 'screen');
    const unwatched = buildTiles({ ...base, rows: [row('me', true), row('u2')], screenKeys: [key], remote: [remote('u2', 'screen', screen)] });
    expect(unwatched.find((t) => t.key === key)).toMatchObject({ kind: 'screen', stream: null, watchable: true, hasVideo: false });
    const watched = buildTiles({ ...base, rows: [row('me', true), row('u2')], screenKeys: [key], watching: [key], remote: [remote('u2', 'screen', screen)] });
    expect(watched.find((t) => t.key === key)).toMatchObject({ kind: 'screen', stream: screen, watchable: false, hasVideo: true });
  });
});

describe('stageView', () => {
  it('is the plain list while nobody has video', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2')] });
    expect(stageView(tiles, null)).toEqual({ mode: 'list' });
  });

  it('is a duo in a one to one call: the other person large and you small', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2')], remote: [remote('u2', 'camera', stream('c'))] });
    expect(stageView(tiles, null)).toMatchObject({ mode: 'duo', remote: { key: 'u2:main' }, self: { key: 'me:main' } });
  });

  it('is a duo when only you have video', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2')], localCamera: stream('mine') });
    expect(stageView(tiles, null).mode).toBe('duo');
  });

  it('is a grid of two columns in a group, everyone with a tile', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2'), row('u3'), row('u4'), row('u5')], remote: [remote('u2', 'camera', stream('c'))] });
    const view = stageView(tiles, null);
    expect(view).toMatchObject({ mode: 'grid', columns: 2 });
    expect(view.mode === 'grid' && view.tiles).toHaveLength(5);
  });

  it('is a single column grid for one tile', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true)], localCamera: stream('mine') });
    expect(stageView(tiles, null)).toMatchObject({ mode: 'grid', columns: 1 });
  });

  it('enlarges the tile the user tapped and keeps the others in a strip', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2'), row('u3')], remote: [remote('u2', 'camera', stream('c'))] });
    const view = stageView(tiles, 'u2:main');
    expect(view).toMatchObject({ mode: 'focus', main: { key: 'u2:main' } });
    expect(view.mode === 'focus' && view.strip.map((t) => t.key)).toEqual(['me:main', 'u3:main']);
  });

  it('ignores a focus on a tile that is gone', () => {
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2')], remote: [remote('u2', 'camera', stream('c'))] });
    expect(stageView(tiles, 'u9:main').mode).toBe('duo');
  });

  it('shows a remote screen share even before anyone has a camera on, so Watch can be offered', () => {
    const key = tileKey('u2', 'screen');
    const tiles = buildTiles({ ...base, rows: [row('me', true), row('u2')], screenKeys: [key] });
    expect(stageView(tiles, null)).toMatchObject({ mode: 'grid' });
  });
});
