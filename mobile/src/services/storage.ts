/**
 * Storage management utility.
 *
 * Checks available disk space, manages model files,
 * and cleans up temporary audio files.
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const MODEL_PATH = `${FileSystem.documentDirectory}whisper-models/`;
const CACHE_DIR = `${FileSystem.cacheDirectory}reflector/`;

interface StorageInfo {
  freeSpace: number; // bytes
  modelSize: number; // bytes
  cacheSize: number; // bytes
  hasEnoughSpace: boolean;
}

/** Get storage information */
export async function getStorageInfo(): Promise<StorageInfo> {
  const freeSpace = (await FileSystem.getFreeDiskStorageAsync()) ?? Infinity;
  const modelSize = await getDirectorySize(MODEL_PATH);
  const cacheSize = await getDirectorySize(CACHE_DIR);

  return {
    freeSpace,
    modelSize,
    cacheSize,
    hasEnoughSpace: freeSpace > 100 * 1024 * 1024, // 100MB min
  };
}

/** Get total size of a directory */
async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists) return 0;

    const contents = await FileSystem.readDirectoryAsync(dirPath);
    let total = 0;

    for (const name of contents) {
      const fileInfo = await FileSystem.getInfoAsync(`${dirPath}${name}`);
      if (fileInfo.exists && 'size' in fileInfo) {
        total += fileInfo.size ?? 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** Clean up old cached audio files */
export async function cleanupCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Check if enough free space for model download (~100MB) */
export async function hasSpaceForModel(): Promise<boolean> {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    return free > 100 * 1024 * 1024; // 100MB
  } catch {
    return true; // Can't check — assume yes
  }
}

/** Get platform-specific storage paths */
export function getStoragePaths() {
  return {
    documents: FileSystem.documentDirectory,
    cache: FileSystem.cacheDirectory,
    modelDir: MODEL_PATH,
    cacheDir: CACHE_DIR,
  };
}