import { describe, expect, it, vi } from 'vitest';
import { VoiceOp } from '@discordy/core/contracts/voice';
import { DaveSession } from '@discordy/core/application/voice/daveSession';
import type { KeyMaterialSource } from '@discordy/core/application/ports/voice';
import { frameKeyLabel } from '@discordy/core/domain/frameFormat';

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function setup(supported = true, hasPeers = true, extra: Partial<ConstructorParameters<typeof DaveSession>[0]> = {}) {
  const sent: { op: number; d: unknown }[] = [];
  const active: boolean[] = [];
  const errors: string[] = [];
  const crypto = {
    generateKeyPackages: vi.fn(async () => ['kp1']),
    hasGroup: vi.fn(async (_group: string) => false),
    deleteGroup: vi.fn(async (_group: string) => true),
    createGroup: vi.fn(async (_group: string) => 1),
    addMembers: vi.fn(async () => ({ commitB64: 'c', welcomeB64: 'w', epoch: 2 })),
    joinFromWelcome: vi.fn(async () => ({ groupId: 'voice:g', epoch: 5 })),
    processIncoming: vi.fn(async (_group: string, _message: string) => ({ kind: 'commit' as const, epoch: 3 })),
    exportSecret: vi.fn(async () => b64([1, 2, 3, 4])),
    memberKeys: vi.fn(async (_group: string) => ['key-of-me'] as string[]),
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
    ...extra,
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

describe('DaveSession with the media group a previous call left on this device', () => {
  /** The MLS engine persists groups, and the group id is the voice channel, so every earlier call in it leaves one behind. */
  function withPersistedGroup(hasPeers = true) {
    const ctx = setup(true, hasPeers);
    const groups = new Set(['voice:g']);
    ctx.crypto.hasGroup.mockImplementation(async (id: string) => groups.has(id));
    ctx.crypto.deleteGroup.mockImplementation(async (id: string) => groups.delete(id));
    ctx.crypto.createGroup.mockImplementation(async (id: string) => {
      groups.add(id);
      return 0;
    });
    ctx.crypto.processIncoming.mockImplementation(async (id: string, _message: string) => {
      if (groups.has(id)) throw new Error('commit is for another epoch than the stale group');
      throw new Error('unknown MLS group');
    });
    return ctx;
  }

  it('a rejoining member drops its stale group, so the commit that adds it is not applied to it and its welcome keys survive', async () => {
    const { dave, cryptor, crypto, errors, active } = withPersistedGroup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: false });
    await dave.handleOp(VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT, { transition_id: 1, commit: 'cm' });
    await dave.handleOp(VoiceOp.DAVE_MLS_WELCOME, { transition_id: 1, welcome: 'w' });
    expect(crypto.deleteGroup).toHaveBeenCalledWith('voice:g');
    expect(errors).toEqual([]);
    expect(cryptor.clear).not.toHaveBeenCalled();
    expect(active).toEqual([true]);
  });

  it('a founder starts a new group instead of trusting the one left by the last call, which has other members and no keys installed', async () => {
    const { dave, crypto, cryptor, active } = withPersistedGroup(false);
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    expect(crypto.deleteGroup).toHaveBeenCalledWith('voice:g');
    expect(crypto.createGroup).toHaveBeenCalledWith('voice:g');
    expect(cryptor.activate).toHaveBeenCalled();
    expect(active).toEqual([true]);
    await dave.handleOp(VoiceOp.DAVE_MLS_KEY_PACKAGE, { user_id: 'u2', key_package_b64: 'kp2' });
    expect(crypto.addMembers).toHaveBeenCalled();
  });
});

describe('DaveSession ordering and failures of a rejoin', () => {
  it('handles the departure of a member before the key package of its rejoin, however slow the device lookup is', async () => {
    const { dave, crypto } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    const order: string[] = [];
    crypto.removeMembers.mockImplementation(async () => {
      order.push('remove');
      return { commitB64: 'rc', epoch: 4 };
    });
    crypto.addMembers.mockImplementation(async () => {
      order.push('add');
      return { commitB64: 'c', welcomeB64: 'w', epoch: 5 };
    });
    const slowKeys = (dave as unknown as { options: { identityKeysOf: () => Promise<string[]> } }).options;
    slowKeys.identityKeysOf = () => new Promise((resolve) => setTimeout(() => resolve(['k']), 20));
    void dave.participantLeft('u2');
    await dave.handleOp(VoiceOp.DAVE_MLS_KEY_PACKAGE, { user_id: 'u2', key_package_b64: 'kp2' });
    expect(order).toEqual(['remove', 'add']);
  });

  it('keeps the established keys when a key package cannot be added, instead of silencing the sender for everyone', async () => {
    const { dave, crypto, cryptor, active, errors } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    crypto.addMembers.mockRejectedValueOnce(new Error('no new members to add'));
    await dave.handleOp(VoiceOp.DAVE_MLS_KEY_PACKAGE, { user_id: 'u2', key_package_b64: 'kp2' });
    expect(errors).toEqual(['no new members to add']);
    expect(cryptor.clear).not.toHaveBeenCalled();
    expect(dave.isActive).toBe(true);
    expect(active).toEqual([true]);
  });
});

describe('DaveSession committer handoff', () => {
  const keys: Record<string, string[]> = { '10': ['k10'], '20': ['k20'], '30': ['k30'], '40': ['k40'], '100': ['k100'] };

  /** `userId` joined by the welcome of committer 10; the others present are `members`; `inGroup` are the identity keys of the MLS roster. */
  async function member(userId: string, members: string[], inGroup: string[]) {
    const ctx = setup(true, true, { userId, members: () => members, identityKeysOf: async (id) => keys[id] ?? [] });
    ctx.crypto.memberKeys.mockResolvedValue(inGroup);
    await ctx.dave.handleOp(VoiceOp.DAVE_MLS_WELCOME, { user_id: '10', transition_id: 1, welcome: 'w' });
    return ctx;
  }

  it('makes the lowest user id in the MLS roster the committer when the committer leaves, and only that member', async () => {
    const lowest = await member('20', ['30'], ['k10', 'k20', 'k30']);
    const other = await member('30', ['20'], ['k10', 'k20', 'k30']);
    await Promise.all([lowest.dave.participantLeft('10'), other.dave.participantLeft('10')]);
    expect(lowest.crypto.removeMembers).toHaveBeenCalledWith('voice:g', ['k10']);
    expect(lowest.sent.at(-1)?.op).toBe(VoiceOp.DAVE_MLS_COMMIT_WELCOME);
    expect(other.crypto.removeMembers).not.toHaveBeenCalled();
    // A rejoiner's key package now reaches exactly one committer.
    for (const ctx of [lowest, other]) await ctx.dave.handleOp(VoiceOp.DAVE_MLS_KEY_PACKAGE, { user_id: '10', key_package_b64: 'kp' });
    expect(lowest.crypto.addMembers).toHaveBeenCalledTimes(1);
    expect(other.crypto.addMembers).not.toHaveBeenCalled();
  });

  it('skips a participant that is present but not yet in the group, and compares ids as numbers', async () => {
    const ctx = await member('30', ['20', '100'], ['k10', 'k30', 'k100']);
    await ctx.dave.participantLeft('10');
    // 20 has no leaf in the group and 100 is a larger number than 30: this member is the lowest eligible.
    expect(ctx.crypto.removeMembers).toHaveBeenCalled();
  });

  it('does not take over when a member other than the committer leaves', async () => {
    const ctx = await member('20', ['30'], ['k10', 'k20', 'k30']);
    await ctx.dave.participantLeft('30');
    expect(ctx.crypto.removeMembers).not.toHaveBeenCalled();
  });

  it('follows the member whose commit it receives as the committer', async () => {
    const ctx = await member('30', ['20'], ['k10', 'k20', 'k30']);
    ctx.crypto.hasGroup.mockResolvedValue(true);
    await ctx.dave.handleOp(VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT, { user_id: '20', transition_id: 2, commit: 'cm' });
    await ctx.dave.participantLeft('20');
    expect(ctx.crypto.removeMembers).toHaveBeenCalled();
  });

  it('keeps its keys when the election itself fails', async () => {
    const ctx = await member('20', ['30'], ['k10', 'k20']);
    ctx.crypto.memberKeys.mockRejectedValueOnce(new Error('store locked'));
    await ctx.dave.participantLeft('10');
    expect(ctx.errors).toEqual(['store locked']);
    expect(ctx.cryptor.clear).not.toHaveBeenCalled();
    expect(ctx.dave.isActive).toBe(true);
  });

  it('reports each activated epoch so viewers can ask for keyframes', async () => {
    const onEpoch = vi.fn();
    const ctx = setup(true, true, { onEpoch });
    await ctx.dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    expect(onEpoch).toHaveBeenCalledTimes(1);
  });
});
