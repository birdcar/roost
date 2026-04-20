export {
  StorableFile,
  AttachmentTooLargeError,
  FileNotFoundError,
  setStorageResolver,
  getStorageResolver,
  detectMimeType,
} from './storable-file.js';
export type { FileRecord, StorageResolver, StorableFileSource } from './storable-file.js';
export { Image } from './image.js';
export type { ImageDimensions } from './image.js';
export { Document } from './document.js';

// `Files` is lifted to `rag/files/files.ts` in Phase 5 so it can carry
// `.store/.get/.delete/.fake` alongside `.Image/.Document`. Re-exported here
// for P4 backward compat.
export { Files } from '../rag/files/files.js';
