import type { StorageService, FileStats } from './StorageService';
import type { Readable } from 'stream';
import { LocalStorageService } from './LocalStorageService';

/**
 * Overlay for the Vercel preview: writes stay in ephemeral /tmp, while official
 * starter experiences are shipped with the build and are read-only.
 * This does NOT make new/edited experiences persistent.
 */
export class BundledFallbackStorageService implements StorageService {
  constructor(
    private readonly writable: LocalStorageService,
    private readonly bundled: LocalStorageService,
  ) {}

  storeFile(file: string, data: Buffer): Promise<void> {
    return this.writable.storeFile(file, data);
  }
  storeFileFromStream(file: string, data: Readable): Promise<void> {
    return this.writable.storeFileFromStream(file, data);
  }
  async readFile(file: string): Promise<Buffer> {
    if (await this.writable.fileExists(file)) return this.writable.readFile(file);
    return this.bundled.readFile(file);
  }
  async readFileAsText(file: string): Promise<string> {
    if (await this.writable.fileExists(file)) return this.writable.readFileAsText(file);
    return this.bundled.readFileAsText(file);
  }
  deleteFile(file: string): Promise<void> {
    return this.writable.deleteFile(file);
  }
  async listFiles(dir: string): Promise<string[]> {
    const [writable, bundled] = await Promise.all([
      this.writable.listFiles(dir),
      this.bundled.listFiles(dir),
    ]);
    return [...new Set([...writable, ...bundled])];
  }
  async listDirectories(dir: string): Promise<string[]> {
    const [writable, bundled] = await Promise.all([
      this.writable.listDirectories(dir),
      this.bundled.listDirectories(dir),
    ]);
    return [...new Set([...writable, ...bundled])];
  }
  async fileExists(file: string): Promise<boolean> {
    return (await this.writable.fileExists(file)) || this.bundled.fileExists(file);
  }
  getFileUrl(file: string): string {
    return this.writable.getFileUrl(file);
  }
  async getFileStats(file: string): Promise<FileStats | null> {
    return (await this.writable.getFileStats(file)) ?? this.bundled.getFileStats(file);
  }
  createDirectory(dir: string): Promise<void> {
    return this.writable.createDirectory(dir);
  }
  deleteDirectory(dir: string): Promise<void> {
    return this.writable.deleteDirectory(dir);
  }
}
