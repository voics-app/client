import { describe, expect, it } from 'vitest';
import { imageUploadError, MAX_IMAGE_UPLOAD_BYTES } from '@renderer/interface/features/settings/imageUpload';

describe('imageUploadError', () => {
  it('bounds uploads at 10 MiB, the api limit', () => {
    expect(MAX_IMAGE_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('accepts an image exactly at the bound', () => {
    expect(imageUploadError({ size: MAX_IMAGE_UPLOAD_BYTES })).toBeNull();
  });

  it('explains inline why an image over 10 MiB is refused', () => {
    expect(imageUploadError({ size: MAX_IMAGE_UPLOAD_BYTES + 1 })).toBe('Images must be 10 MB or smaller.');
  });
});
