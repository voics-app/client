/** Side-effecting actions behind the message menus. Each reports failure with a toast. */
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { isLinkPreview, SUPPRESS_EMBEDS_FLAG } from '@renderer/domain/media';
import { attempt } from './actions';
import { googleSearchUrl, openExternalUrl } from './links';
import { getRuntime } from './runtime';

export const speechSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speakText(text: string): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function searchGoogle(text: string): void {
  openExternalUrl(googleSearchUrl(text));
}

function drawToPng(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image.'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not load the image.'));
    img.src = url;
  });
}

async function fetchBlob(url: string): Promise<Blob> {
  if (!url.startsWith('blob:')) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {
      /* fall through to the canvas path */
    }
  } else {
    try {
      return await (await fetch(url)).blob();
    } catch {
      /* fall through */
    }
  }
  return drawToPng(url);
}

export async function copyImage(url: string): Promise<void> {
  await attempt(async () => {
    let blob = await fetchBlob(url);
    if (blob.type !== 'image/png') blob = await drawToPng(URL.createObjectURL(blob));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    useUiStore.getState().toast({ tone: 'success', title: 'Image copied' });
  }, 'Could not copy image');
}

export async function saveImage(url: string, filename: string): Promise<void> {
  await attempt(async () => {
    const blob = await fetchBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'image';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }, 'Could not save image');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the emoji.'));
    r.readAsDataURL(blob);
  });
}

/** Re-uploads a custom emoji seen in chat into the given server. */
export async function addEmojiToGuild(guildId: string, name: string, url: string): Promise<void> {
  const created = await attempt(async () => {
    const image = await blobToDataUrl(await fetchBlob(url));
    return getRuntime().api.createEmoji(guildId, { name, image });
  }, 'Could not add emoji');
  if (created) {
    const guild = useGuildStore.getState().guilds[guildId];
    if (guild) useGuildStore.getState().patchGuild({ id: guildId, emojis: [...(guild.emojis ?? []), created] });
    useUiStore.getState().toast({ tone: 'success', title: `Added :${created.name}: to the server` });
  }
}

/** The hover "x" on a link preview: hides every preview of the message for everyone. Rolled back if the server refuses. */
export async function suppressEmbeds(message: ChatMessage): Promise<void> {
  const store = useMessageStore.getState();
  const before = { embeds: message.embeds, flags: message.flags };
  const flags = (message.flags ?? 0) | SUPPRESS_EMBEDS_FLAG;
  store.patch(message.channel_id, message.id, { embeds: message.embeds.filter((embed) => !isLinkPreview(embed)), flags });
  const updated = await attempt(() => getRuntime().api.editMessage(message.channel_id, message.id, { flags }), 'Could not remove previews');
  if (!updated) store.patch(message.channel_id, message.id, before);
}
