/** Largest avatar, icon or banner the api accepts; the api enforces the same 10 MiB bound. */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The inline message for a picked file the api would refuse, or null when it can be uploaded. */
export function imageUploadError(file: { size: number }): string | null {
  return file.size > MAX_IMAGE_UPLOAD_BYTES ? 'Images must be 10 MB or smaller.' : null;
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Reads a picked image for upload; rejects with the inline message when it is too large. */
export async function readImageUpload(file: File): Promise<string> {
  const problem = imageUploadError(file);
  if (problem) throw new Error(problem);
  return readAsDataUrl(file);
}
