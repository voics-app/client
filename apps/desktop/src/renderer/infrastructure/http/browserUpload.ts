import { ApiError, type ProgressUpload } from '@discordy/core/infrastructure/http/httpClient';

/** PUT through XMLHttpRequest, the only browser API that reports upload progress. Aborting rejects with an AbortError. */
export const uploadWithProgress: ProgressUpload = (url, file, onProgress, signal) => {
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
        reject(new ApiError(request.status, request.status, `Upload failed (${request.status})`));
      }
    };
    request.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Upload failed: the connection was lost.'));
    };
    request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (signal?.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
};
