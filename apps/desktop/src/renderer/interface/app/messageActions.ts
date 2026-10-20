/** Side-effecting actions behind the message menus. Each reports failure with a toast. */
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
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
