export type AttachmentFailure =
  | 'too_large'
  | 'too_many'
  | 'empty'
  | 'integrity'
  | 'size_mismatch'
  | 'upload_failed'
  | 'download_failed'
  | 'transfer_failed'
  | 'unavailable'
  | 'peer_offline';
