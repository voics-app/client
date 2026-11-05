import type * as HapticsModule from '../src/haptics';
import { AccessibilityInfo } from 'react-native';

interface ExpoHaptics {
  impactAsync: jest.Mock;
  selectionAsync: jest.Mock;
  notificationAsync: jest.Mock;
}

const load = async (reduceMotion: boolean) => {
  jest.resetModules();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  const haptics = jest.requireActual('../src/haptics') as typeof HapticsModule;
  const expo = jest.requireMock('expo-haptics') as ExpoHaptics;
  await Promise.resolve();
  await Promise.resolve();
  return { haptics, expo };
};

describe('haptics', () => {
  it('gives a light tap, a selection tick and send results', async () => {
    const { haptics, expo } = await load(false);
    haptics.tapLight();
    haptics.tickSelection();
    haptics.notifySuccess();
    haptics.notifyError();
    expect(expo.impactAsync).toHaveBeenCalledWith('light');
    expect(expo.selectionAsync).toHaveBeenCalled();
    expect(expo.notificationAsync).toHaveBeenCalledWith('success');
    expect(expo.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('stays silent while Reduce Motion is on', async () => {
    const { haptics, expo } = await load(true);
    expo.impactAsync.mockClear();
    expo.selectionAsync.mockClear();
    haptics.tapLight();
    haptics.tickSelection();
    expect(expo.impactAsync).not.toHaveBeenCalled();
    expect(expo.selectionAsync).not.toHaveBeenCalled();
  });
});
