import { Stack } from 'expo-router';
import { Notice } from '../ui/controls';
import { AccountPage } from './AccountPage';
import { AccessibilityPage, ChatPage, NotificationsPage } from './AppPrefsPages';
import { AppearancePage } from './AppearancePage';
import { DevicesPage } from './DevicesPage';
import { PrivacyPage } from './PrivacyPage';
import { ProfilePage } from './ProfilePage';
import { isUserPage, pageLabel, type UserPageId } from './userPages';

const PAGES: Record<UserPageId, (props: { highlight: string | null }) => React.JSX.Element | null> = {
  account: AccountPage,
  profile: ProfilePage,
  privacy: PrivacyPage,
  devices: DevicesPage,
  appearance: AppearancePage,
  accessibility: AccessibilityPage,
  notifications: NotificationsPage,
  chat: ChatPage,
};

/** One user settings page by id. `row` is the setting a search result pointed at, which the page marks. */
export function SettingsPageScreen({ page, row }: { page: string; row?: string | undefined }) {
  if (!isUserPage(page)) return <Notice>This settings page does not exist.</Notice>;
  const Page = PAGES[page];
  return (
    <>
      <Stack.Screen options={{ title: pageLabel(page) }} />
      <Page highlight={row ?? null} />
    </>
  );
}
