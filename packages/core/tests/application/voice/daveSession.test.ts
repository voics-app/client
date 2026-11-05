import { describe, expect, it, vi } from 'vitest';
import { VoiceOp } from '@discordy/core/contracts/voice';
import { DaveSession } from '@discordy/core/application/voice/daveSession';
import type { KeyMaterialSource } from '@discordy/core/application/ports/voice';
import { frameKeyLabel } from '@discordy/core/domain/frameFormat';

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function setup(supported = true, hasPeers = true) {
  const sent: { op: number; d: unknown }[] = [];
  const active: boolean[] = [];
  const errors: string[] = [];
  const crypto = {
    generateKeyPackages: vi.fn(async () => ['kp1']),
    hasGroup: vi.fn(async () => false),
    createGroup: vi.fn(async () => 1),
    addMembers: vi.fn(async () => ({ commitB64: 'c', welcomeB64: 'w', epoch: 2 })),
    joinFromWelcome: vi.fn(async () => ({ groupId: 'voice:g', epoch: 5 })),
    processIncoming: vi.fn(async () => ({ kind: 'commit' as const, epoch: 3 })),
    exportSecret: vi.fn(async () => b64([1, 2, 3, 4])),
    removeMembers: vi.fn(async (_group: string, _keys: string[]) => ({ commitB64: 'rc', epoch: 4 }) as { commitB64: string; epoch: number } | null),
  };
  const cryptor = {
    supported,
    gated: false,
    attachSender: vi.fn(async () => undefined),
    attachReceiver: vi.fn(async () => undefined),
    setEpoch: vi.fn(async (_generation: number, _material: KeyMaterialSource) => undefined),
    activate: vi.fn(async () => undefined),
    bypass: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
  const dave = new DaveSession({
    groupId: 'voice:g',
    userId: 'me',
    crypto,
    cryptor,
    identityKeysOf: async () => ['key-of-leaver'],
    hasPeers: () => hasPeers,
    send: (op, d) => sent.push({ op, d }),
    onActive: (a) => active.push(a),
    onError: (m) => errors.push(m),
  });
  return { dave, crypto, cryptor, sent, active, errors };
}

describe('DaveSession', () => {
  it('refuses to start without a frame transform implementation', async () => {
    const { dave, errors, sent } = setup(false);
    await dave.start(1);
    expect(errors).toHaveLength(1);
    expect(sent).toHaveLength(0);
    expect(dave.isActive).toBe(false);
  });

  it('sends a key package on start and stays inactive until keys are activated', async () => {
    const { dave, sent, active } = setup();
    await dave.start(1);
    expect(sent).toEqual([{ op: VoiceOp.DAVE_MLS_KEY_PACKAGE, d: { key_package_b64: 'kp1' } }]);
    expect(active).toEqual([]);
    expect(dave.isActive).toBe(false);
  });

  it('founds the group, installs the exporter-derived key and activates', async () => {
    const { dave, crypto, cryptor, active } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    expect(crypto.createGroup).toHaveBeenCalledWith('voice:g');
    expect(cryptor.setEpoch.mock.calls[0]![0]).toBe(1);
    const material = await cryptor.setEpoch.mock.calls[0]![1]('42', 1);
    expect(crypto.exportSecret).toHaveBeenCalledWith('voice:g', frameKeyLabel('42', 1), 32);
    expect(Array.from(material)).toEqual([1, 2, 3, 4]);
    expect(cryptor.activate).toHaveBeenCalledWith(1);
    expect(active).toEqual([true]);
  });

  it('does not found when the node says another member founds, and founds when it says so', async () => {
    const other = setup();
    await other.dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: false });
    expect(other.crypto.createGroup).not.toHaveBeenCalled();
    const first = setup();
    await first.dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    expect(first.crypto.createGroup).toHaveBeenCalledWith('voice:g');
    expect(first.active).toEqual([true]);
  });

  it('falls back to "nobody was in the call" when an older node sends no founder flag', async () => {
    const alone = setup(true, false);
    await alone.dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, {});
    expect(alone.crypto.createGroup).toHaveBeenCalled();
    const joiner = setup(true, true);
    await joiner.dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, {});
    expect(joiner.crypto.createGroup).not.toHaveBeenCalled();
  });

  it('joins from a welcome and activates the epoch immediately (the node never sends EXECUTE)', async () => {
    const { dave, cryptor, sent, active, crypto } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_WELCOME, { transition_id: 9, welcome: 'w' });
    expect(crypto.joinFromWelcome).toHaveBeenCalledWith('w');
    expect(cryptor.setEpoch).toHaveBeenCalledWith(5, expect.any(Function));
    expect(cryptor.activate).toHaveBeenCalledWith(5);
    expect(sent).toEqual([]);
    expect(active).toEqual([true]);
  });

  it('the committer adds members and relays commit and welcome in the shape the voice node routes', async () => {
    const { dave, sent, crypto } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    await dave.handleOp(VoiceOp.DAVE_MLS_KEY_PACKAGE, { user_id: 'u2', key_package_b64: 'kp2' });
    expect(crypto.addMembers).toHaveBeenCalledWith('voice:g', ['kp2']);
    expect(sent.at(-1)).toEqual({
      op: VoiceOp.DAVE_MLS_COMMIT_WELCOME,
      d: { transition_id: 1, commit: 'c', welcome: 'w', recipient_ids: ['u2'] },
    });
  });

  it('applies announced commits and rotates to the new epoch', async () => {
    const { dave, cryptor, crypto } = setup();
    crypto.hasGroup.mockResolvedValue(true);
    await dave.handleOp(VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT, { transition_id: 4, commit: 'cm' });
    expect(crypto.processIncoming).toHaveBeenCalledWith('voice:g', 'cm');
    expect(cryptor.activate).toHaveBeenCalledWith(3);
  });

  it('ignores the commit announced to a joiner and keeps the keys its welcome installs, even when both race', async () => {
    const { dave, cryptor, crypto, errors, active } = setup();
    crypto.processIncoming.mockRejectedValue(new Error('unknown MLS group'));
    await Promise.all([
      dave.handleOp(VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT, { transition_id: 1, commit: 'cm' }),
      dave.handleOp(VoiceOp.DAVE_MLS_WELCOME, { transition_id: 1, welcome: 'w' }),
    ]);
    expect(errors).toEqual([]);
    expect(crypto.processIncoming).not.toHaveBeenCalled();
    expect(cryptor.clear).not.toHaveBeenCalled();
    expect(cryptor.activate).toHaveBeenCalledWith(5);
    expect(active).toEqual([true]);
  });

  it('clears keys and goes inactive on failure or an invalid commit', async () => {
    const { dave, cryptor, crypto, active, errors, sent } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    expect(dave.isActive).toBe(true);
    await dave.handleOp(VoiceOp.DAVE_MLS_INVALID_COMMIT, { transition_id: 1 });
    expect(cryptor.clear).toHaveBeenCalled();
    expect(active).toEqual([true, false]);
    expect(sent.at(-1)?.op).toBe(VoiceOp.DAVE_MLS_KEY_PACKAGE);

    crypto.hasGroup.mockResolvedValue(true);
    crypto.processIncoming.mockRejectedValueOnce(new Error('bad commit'));
    await dave.handleOp(VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT, { transition_id: 2, commit_b64: 'x' });
    expect(errors).toEqual(['bad commit']);
  });
});

describe('DaveSession participant removal', () => {
  it('commits the removal of a departed participant and rotates the media key on the new epoch', async () => {
    const { dave, crypto, cryptor, sent } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    cryptor.setEpoch.mockClear();

    await dave.participantLeft('leaver');

    expect(crypto.removeMembers).toHaveBeenCalledWith('voice:g', ['key-of-leaver']);
    expect(cryptor.setEpoch.mock.calls[0]![0]).toBe(4);
    expect(sent.at(-1)).toEqual({ op: VoiceOp.DAVE_MLS_COMMIT_WELCOME, d: { transition_id: 1, commit: 'rc' } });
  });

  it('does nothing on a device that is not the committer', async () => {
    const { dave, crypto } = setup();
    await dave.participantLeft('leaver');
    expect(crypto.removeMembers).not.toHaveBeenCalled();
  });
});
