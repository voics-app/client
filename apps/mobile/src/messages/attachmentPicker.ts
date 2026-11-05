import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { acceptFiles } from '@discordy/core/domain/composerLimits';
import type { OutgoingFile } from './outgoingFile';

/** The most one file may weigh when sent to a standard channel, as on desktop. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const lastSegment = (uri: string): string => decodeURIComponent(uri.split('?')[0]!.split('/').pop() ?? '') || 'file';

/** A photo or video from the library or the camera. */
export function fromImageAsset(asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'fileName' | 'fileSize' | 'mimeType' | 'type'>): OutgoingFile {
  const video = asset.type === 'video';
  return {
    uri: asset.uri,
    name: asset.fileName || lastSegment(asset.uri),
    size: asset.fileSize ?? 0,
    mimeType: asset.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'),
  };
}

/** A file from the document picker. */
export function fromDocumentAsset(asset: Pick<DocumentPicker.DocumentPickerAsset, 'uri' | 'name' | 'size' | 'mimeType'>): OutgoingFile {
  return { uri: asset.uri, name: asset.name || lastSegment(asset.uri), size: asset.size ?? 0, mimeType: asset.mimeType ?? 'application/octet-stream' };
}

/** Applies the count and size limits to what was just picked; the problems are shown to the user. */
export function addFiles(existing: readonly OutgoingFile[], incoming: readonly OutgoingFile[]): { files: OutgoingFile[]; problems: string[] } {
  const { accepted, problems } = acceptFiles(existing, incoming, MAX_FILE_BYTES, true);
  return { files: [...existing, ...accepted], problems };
}

export async function pickFromLibrary(): Promise<OutgoingFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 10 });
  return result.canceled ? [] : result.assets.map(fromImageAsset);
}

/** Null when the camera permission was refused. */
export async function takePhoto(): Promise<OutgoingFile[] | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'] });
  return result.canceled ? [] : result.assets.map(fromImageAsset);
}

export async function pickDocuments(): Promise<OutgoingFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  return result.canceled ? [] : result.assets.map(fromDocumentAsset);
}
