import { ApiError, type ProgressUpload } from '@discordy/core/infrastructure/http/httpClient';

/** PUT through XMLHttpRequest, which React Native supports with upload progress. Aborting rejects with an error named AbortError. */
export const uploadWithProgress: ProgressUpload = (url, file, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const cancelled = () => Object.assign(new Error('Upload cancelled'), { name: 'AbortError' });
    if (signal?.aborted) return reject(cancelled());
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const done = () => signal?.removeEventListener('abort', abort);
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    request.onload = () => {
      done();
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size, file.size);
        resolve();
      } else {
        reject(new ApiError(request.status, request.status, `Upload failed (${request.status})`));
      }
    };
    request.onerror = () => {
      done();
      reject(new Error('Upload failed: the connection was lost.'));
    };
    request.onabort = () => {
      done();
      reject(cancelled());
    };
    signal?.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
