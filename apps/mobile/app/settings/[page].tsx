import { useLocalSearchParams } from 'expo-router';
import { SettingsPageScreen } from '../../src/settings/SettingsPageScreen';

export default function Route() {
  const { page, row } = useLocalSearchParams<{ page: string; row?: string }>();
  return <SettingsPageScreen page={page} row={row} />;
}
