/** A file chosen on the device to send: from the photo library, the camera or the document picker. */
export interface OutgoingFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Raised inside the upload when the user cancels it; the unsent message is then removed. */
export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled');
  }
}
