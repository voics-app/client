import { MainScreen } from '../../src/shell/MainScreen';

export default function DmsRoute() {
  return <MainScreen select={{ kind: 'home', channelId: null }} />;
}
