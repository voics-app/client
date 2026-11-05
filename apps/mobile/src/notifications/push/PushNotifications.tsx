import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { useMentionInboxStore } from '@discordy/core/application/stores/mentionInboxStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { channelIdFromPath } from '../bannerModel';
import { getPush } from './index';

/**
 * Wires push notifications to the app's life: listens from launch (a tap that opened the app is kept until sign-in), registers the token when the
 * session is ready, offers the permission the first time a chat is open, keeps the icon badge at the unread mentions, and clears it at sign-out.
 * Renders nothing; in Expo Go the controller does nothing.
 */
export function PushNotifications() {
  const ready = useSessionStore((s) => s.status === 'connecting' || s.status === 'ready');
  const inChat = channelIdFromPath(usePathname()) !== null;
  const mentions = useMentionInboxStore((s) => s.entries.length);

  useEffect(() => {
    const push = getPush();
    push.attach();
    return () => push.detach();
  }, []);

  useEffect(() => {
    const push = getPush();
    if (ready) void push.signedInStart(inChat);
    else push.signedOut();
    // inChat is read once at the moment the session becomes ready; later chat visits go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (ready && inChat) void getPush().enteredChat();
  }, [ready, inChat]);

  useEffect(() => {
    if (ready) getPush().setBadge(mentions);
  }, [ready, mentions]);

  return null;
}
