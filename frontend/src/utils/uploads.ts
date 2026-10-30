// The server takes files of at most this size (see MAX_UPLOAD_BYTES in the
// backend's storage service); checking first saves a pointless upload.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "2 MB";
