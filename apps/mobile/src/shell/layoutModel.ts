import { Dimensions, useWindowDimensions } from 'react-native';

/** The shortest side, in points, from which the app shows the server rail and channel list beside the chat: every iPad (768 and up, 744 for the mini) and Android tablets, never an iPhone in landscape (430 at most). */
export const WIDE_MIN_SIDE = 600;

/** Width of the channel (or conversation) column next to the 72 pt rail in the side-by-side layout. */
export const WIDE_COLUMN_WIDTH = 288;

export interface WindowSize {
  width: number;
  height: number;
}

export const isWideWindow = ({ width, height }: WindowSize): boolean => Math.min(width, height) >= WIDE_MIN_SIDE;

/** Whether the window is wide right now; for code that runs outside a component (opening a chat from a notification). */
export const isWideNow = (): boolean => isWideWindow(Dimensions.get('window'));

/** Whether the side-by-side layout applies; follows the window, so Split View and Stage Manager resizes switch it. */
export function useWideLayout(): boolean {
  return isWideWindow(useWindowDimensions());
}
