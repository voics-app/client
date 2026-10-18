import { describe, expect, it, vi } from 'vitest';
import { VoiceOp } from '@shared/contracts/voice';
import { DaveSession, FRAME_KEY_LABEL } from '@renderer/infrastructure/voice/daveSession';

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function setup(supported = true) {
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
    attachSender: vi.fn(),
    attachReceiver: vi.fn(),
    setEpoch: vi.fn(async (_generation: number, _secret: Uint8Array) => undefined),
    activate: vi.fn(),
    setPassthrough: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
  const dave = new DaveSession({
    groupId: 'voice:g',
    userId: 'me',
    crypto,
    cryptor,
    identityKeysOf: async () => ['key-of-leaver'],
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
    expect(crypto.exportSecret).toHaveBeenCalledWith('voice:g', FRAME_KEY_LABEL, 32);
    expect(Array.from(cryptor.setEpoch.mock.calls[0]![1] as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(cryptor.setEpoch.mock.calls[0]![0]).toBe(1);
    expect(cryptor.activate).toHaveBeenCalledWith(1);
    expect(active).toEqual([true]);
  });

  it('joins from a welcome and activates only on EXECUTE_TRANSITION', async () => {
    const { dave, cryptor, sent, active } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_WELCOME, { transition_id: 9, welcome_b64: 'w' });
    expect(cryptor.setEpoch).toHaveBeenCalledWith(5, expect.any(Uint8Array));
    expect(sent).toContainEqual({ op: VoiceOp.DAVE_PREPARE_TRANSITION, d: { transition_id: 9 } });
    expect(active).toEqual([]);
    await dave.handleOp(VoiceOp.DAVE_EXECUTE_TRANSITION, { transition_id: 9 });
    expect(cryptor.activate).toHaveBeenCalledWith(5);
    expect(active).toEqual([true]);
  });

  it('the committer adds members and relays commit and welcome', async () => {
    const { dave, sent, crypto } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    await dave.handleOp(VoiceOp.DAVE_MLS_KEY_PACKAGE, { user_id: 'u2', key_package_b64: 'kp2' });
    expect(crypto.addMembers).toHaveBeenCalledWith('voice:g', ['kp2']);
    expect(sent.at(-1)).toEqual({
      op: VoiceOp.DAVE_MLS_COMMIT_WELCOME,
      d: { transition_id: 1, commit_b64: 'c', welcome_b64: 'w', user_ids: ['u2'] },
    });
  });

  it('applies announced commits as pending epochs and activates them on execute', async () => {
    const { dave, cryptor, crypto } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_ANNOUNCE_COMMIT, { transition_id: 4, commit_b64: 'cm' });
    expect(crypto.processIncoming).toHaveBeenCalledWith('voice:g', 'cm');
    expect(cryptor.activate).not.toHaveBeenCalled();
    await dave.handleOp(VoiceOp.DAVE_PREPARE_TRANSITION, { transition_id: 4 });
    expect(cryptor.setPassthrough).toHaveBeenCalledWith(true);
    await dave.handleOp(VoiceOp.DAVE_EXECUTE_TRANSITION, { transition_id: 4 });
    expect(cryptor.activate).toHaveBeenCalledWith(3);
    expect(cryptor.setPassthrough).toHaveBeenLastCalledWith(false);
  });

  it('clears keys and goes inactive on failure or an invalid commit', async () => {
    const { dave, cryptor, crypto, active, errors, sent } = setup();
    await dave.handleOp(VoiceOp.DAVE_MLS_EXTERNAL_SENDER, { founder: true });
    expect(dave.isActive).toBe(true);
    await dave.handleOp(VoiceOp.DAVE_MLS_INVALID_COMMIT, { transition_id: 1 });
    expect(cryptor.clear).toHaveBeenCalled();
    expect(active).toEqual([true, false]);
    expect(sent.at(-1)?.op).toBe(VoiceOp.DAVE_MLS_KEY_PACKAGE);

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
    expect(sent.at(-1)).toEqual({ op: VoiceOp.DAVE_MLS_COMMIT_WELCOME, d: { transition_id: 1, commit_b64: 'rc', welcome_b64: '', user_ids: [] } });
  });

  it('does nothing on a device that is not the committer', async () => {
    const { dave, crypto } = setup();
    await dave.participantLeft('leaver');
    expect(crypto.removeMembers).not.toHaveBeenCalled();
  });
});
