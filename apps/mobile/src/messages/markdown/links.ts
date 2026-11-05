import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { useTrustedDomainStore } from '@discordy/core/application/stores/composerStores';
import { hostOf, isTrustedLink } from '@discordy/core/domain/linkTrust';
import { BRAND } from '../../brand';

const WEB_URL = /^https?:\/\//i;

/** Opens a web link in the in-app browser sheet; anything that is not http or https is ignored. */
export function openLink(url: string): void {
  if (WEB_URL.test(url)) void WebBrowser.openBrowserAsync(url);
}

/** Instance and built-in hosts and the ones the user trusted open at once. */
export function isTrusted(url: string, trusted: readonly string[]): boolean {
  const instance = hostOf(BRAND.apiUrl);
  return isTrustedLink(url, instance ? [...trusted, instance] : trusted);
}

/** A bare link opens at once; a link with a different label (masked) asks first unless the host is trusted. */
export function followLink(url: string, masked: boolean): void {
  const host = hostOf(url);
  if (!masked || !host || isTrusted(url, useTrustedDomainStore.getState().domains)) return openLink(url);
  Alert.alert('You are leaving the app', `${url}\n\nThis link will take you to an external website.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Visit site', onPress: () => openLink(url) },
    {
      text: `Always trust ${host}`,
      onPress: () => {
        useTrustedDomainStore.getState().trust(host);
        openLink(url);
      },
    },
  ]);
}
