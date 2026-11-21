import { ApiError, type ProgressUpload } from '@discordy/core/infrastructure/http/httpClient';
import { createI18n } from '@discordy/core/domain/i18n';

/** PUT through XMLHttpRequest, the only browser API that reports upload progress. Aborting rejects with an AbortError. */
export const createProgressUpload = (locale: () => string | undefined = () => undefined): ProgressUpload => (url, file, onProgress, signal) => {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    request.onload = () => {
      signal?.removeEventListener('abort', abort);
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size, file.size);
        resolve();
      } else {
        reject(new ApiError(request.status, request.status, createI18n(locale()).t('file.uploadStatus', { status: request.status })));
      }
    };
    request.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error(createI18n(locale()).catalogText('Upload failed: the connection was lost.')));
    };
    request.onabort = () => reject(new DOMException(createI18n(locale()).catalogText('Upload cancelled'), 'AbortError'));
    if (signal?.aborted) return reject(new DOMException(createI18n(locale()).catalogText('Upload cancelled'), 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
};

export const uploadWithProgress = createProgressUpload();
