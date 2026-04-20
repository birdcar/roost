import { Image } from './image.js';
import { Document } from './document.js';

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

export const Files = { Image, Document } as const;
