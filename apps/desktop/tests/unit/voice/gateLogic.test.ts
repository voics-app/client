import { describe, expect, it } from 'vitest';
import { MicGate, PttGate, VadGate, levelFromRms, rmsOf } from '@renderer/application/voice/gateLogic';

describe('levels', () => {
  it('maps rms to a 0..1 dB meter', () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(0.001)).toBeCloseTo(0, 5);
    expect(levelFromRms(0.1)).toBeCloseTo(40 / 60, 5);
  });
  it('computes rms', () => {
    expect(rmsOf([1, -1, 1, -1])).toBe(1);
    expect(rmsOf([])).toBe(0);
  });
});

describe('VadGate', () => {
  it('opens at threshold and holds through brief dips', () => {
    const vad = new VadGate({ threshold: 0.5, holdMs: 200 });
    expect(vad.update(0.2, 0)).toBe(false);
    expect(vad.update(0.6, 10)).toBe(true);
    expect(vad.update(0.1, 20)).toBe(true);
    expect(vad.update(0.1, 150)).toBe(true);
    expect(vad.update(0.1, 230)).toBe(false);
  });
  it('does not close inside the hysteresis band and resets the hold timer on recovery', () => {
    const vad = new VadGate({ threshold: 0.5, hysteresis: 0.7, holdMs: 100 });
    vad.update(0.9, 0);
    expect(vad.update(0.4, 50)).toBe(true); // 0.4 >= 0.35: still inside the band
    expect(vad.update(0.4, 500)).toBe(true);
    vad.update(0.1, 600);
    vad.update(0.6, 650);
    expect(vad.update(0.1, 700)).toBe(true);
  });
});

describe('PttGate', () => {
  it('stays open for the release delay after key-up', () => {
    const ptt = new PttGate(200);
    expect(ptt.isOpen(0)).toBe(false);
    ptt.set(true, 0);
    expect(ptt.isOpen(5000)).toBe(true);
    ptt.set(false, 5000);
    expect(ptt.isOpen(5100)).toBe(true);
    expect(ptt.isOpen(5200)).toBe(false);
  });
  it('a new press cancels the pending release', () => {
    const ptt = new PttGate(200);
    ptt.set(true, 0);
    ptt.set(false, 10);
    ptt.set(true, 20);
    expect(ptt.isOpen(1000)).toBe(true);
  });
});

describe('MicGate', () => {
  const base = { mode: 'vad' as const, vadThreshold: 0.3, pttReleaseDelayMs: 100 };
  it('uses VAD in vad mode and ignores PTT', () => {
    const gate = new MicGate(base);
    gate.setPushToTalk(true, 0);
    expect(gate.evaluate(0.1, 0)).toBe(false);
    expect(gate.evaluate(0.5, 10)).toBe(true);
  });
  it('uses PTT in ptt mode and ignores loudness', () => {
    const gate = new MicGate({ ...base, mode: 'ptt' });
    expect(gate.evaluate(0.9, 0)).toBe(false);
    gate.setPushToTalk(true, 10);
    expect(gate.evaluate(0, 20)).toBe(true);
  });
  it('self mute always wins', () => {
    const gate = new MicGate({ ...base, mode: 'ptt' });
    gate.setPushToTalk(true, 0);
    gate.setSelfMute(true);
    expect(gate.evaluate(1, 1)).toBe(false);
  });
});
