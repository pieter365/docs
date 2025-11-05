import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { watch } from "fs";

/**
 * Advanced caching system for large Storybook projects
 * Features:
 * - Multi-level cache (memory + disk)
 * - TTL-based expiration
 * - LRU eviction
 * - File watching for auto-invalidation
 * - Cache statistics
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string;
  hits: number;
}

export interface CacheStats {
  memoryEntries: number;
  diskEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memorySize: number;
  lastClear: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  maxMemoryEntries?: number; // Max entries in memory (default: 1000)
  enableDiskCache?: boolean; // Enable disk persistence (default: true)
  diskCachePath?: string; // Path for disk cache
  enableFileWatching?: boolean; // Auto-invalidate on file changes (default: true)
}

export class CacheManager {
  private memoryCache: Map<string, CacheEntry<any>>;
  private diskCachePath: string;
  private ttl: number;
  private maxMemoryEntries: number;
  private enableDiskCache: boolean;
  private enableFileWatching: boolean;
  private fileWatchers: Map<string, ReturnType<typeof watch>>;
  private stats: {
    hits: number;
    misses: number;
    lastClear: number;
  };

  constructor(options: CacheOptions = {}) {
    this.memoryCache = new Map();
    this.fileWatchers = new Map();
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 minutes
    this.maxMemoryEntries = options.maxMemoryEntries || 1000;
    this.enableDiskCache = options.enableDiskCache !== false;
    this.enableFileWatching = options.enableFileWatching !== false;
    this.diskCachePath =
      options.diskCachePath || path.join(process.cwd(), ".storybook-mcp-cache");
    this.stats = {
      hits: 0,
      misses: 0,
      lastClear: Date.now(),
    };

    if (this.enableDiskCache) {
      this.ensureDiskCacheDir();
    }
  }

  /**
   * Get cached value or compute if not exists
   */
  async get<T>(
    key: string,
    computeFn: () => Promise<T>,
    filePath?: string
  ): Promise<T> {
    const cacheKey = this.generateKey(key);

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && this.isValid(memoryEntry)) {
      memoryEntry.hits++;
      this.stats.hits++;
      return memoryEntry.data as T;
    }

    // Check disk cache
    if (this.enableDiskCache) {
      const diskEntry = await this.getDiskCache<T>(cacheKey);
      if (diskEntry && this.isValid(diskEntry)) {
        // Promote to memory cache
        this.memoryCache.set(cacheKey, diskEntry);
        diskEntry.hits++;
        this.stats.hits++;
        return diskEntry.data;
      }
    }

    // Cache miss - compute value
    this.stats.misses++;
    const data = await computeFn();

    // Compute file hash if file path provided
    let hash = "";
    if (filePath) {
      hash = await this.computeFileHash(filePath);

      // Setup file watcher for auto-invalidation
      if (this.enableFileWatching && !this.fileWatchers.has(filePath)) {
        this.watchFile(filePath, cacheKey);
      }
    }

    // Store in cache
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      hash,
      hits: 0,
    };

    await this.set(cacheKey, entry);

    return data;
  }

  /**
   * Set cache entry
   */
  private async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // Add to memory cache with LRU eviction
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      this.evictLRU();
    }

    this.memoryCache.set(key, entry);

    // Persist to disk
    if (this.enableDiskCache) {
      await this.setDiskCache(key, entry);
    }
  }

  /**
   * Check if cache entry is valid
   */
  private isValid<T>(entry: CacheEntry<T>): boolean {
    const age = Date.now() - entry.timestamp;
    return age < this.ttl;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruHits = Infinity;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.hits < lruHits || (entry.hits === lruHits && entry.timestamp < oldestTime)) {
        lruKey = key;
        lruHits = entry.hits;
        oldestTime = entry.timestamp;
      }
    }

    if (lruKey) {
      this.memoryCache.delete(lruKey);
    }
  }

  /**
   * Compute file hash for cache validation
   */
  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return crypto.createHash("md5").update(content).digest("hex");
    } catch {
      return "";
    }
  }

  /**
   * Watch file for changes and invalidate cache
   */
  private watchFile(filePath: string, cacheKey: string): void {
    try {
      const watcher = watch(filePath, async (eventType) => {
        if (eventType === "change") {
          // Invalidate cache for this file
          await this.invalidate(cacheKey);
          console.error(`Cache invalidated for: ${filePath}`);
        }
      });

      this.fileWatchers.set(filePath, watcher);
    } catch (error) {
      console.error(`Failed to watch file: ${filePath}`, error);
    }
  }

  /**
   * Invalidate specific cache entry
   */
  async invalidate(key: string): Promise<void> {
    const cacheKey = this.generateKey(key);
    this.memoryCache.delete(cacheKey);

    if (this.enableDiskCache) {
      const diskPath = this.getDiskCachePath(cacheKey);
      try {
        await fs.unlink(diskPath);
      } catch {
        // File might not exist
      }
    }
  }

  /**
   * Invalidate all entries matching pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;
    const regex = new RegExp(pattern);

    // Invalidate memory cache
    const keysToDelete: string[] = [];
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.invalidate(key);
      count++;
    }

    return count;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    // Clear memory
    this.memoryCache.clear();

    // Clear disk
    if (this.enableDiskCache) {
      try {
        const files = await fs.readdir(this.diskCachePath);
        for (const file of files) {
          if (file.endsWith(".cache")) {
            await fs.unlink(path.join(this.diskCachePath, file));
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    // Stop file watchers
    for (const [, watcher] of this.fileWatchers) {
      watcher.close();
    }
    this.fileWatchers.clear();

    this.stats.lastClear = Date.now();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    let diskEntries = 0;
    if (this.enableDiskCache) {
      try {
        const files = await fs.readdir(this.diskCachePath);
        diskEntries = files.filter((f) => f.endsWith(".cache")).length;
      } catch {
        diskEntries = 0;
      }
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    // Calculate memory size (approximate)
    const memorySize = JSON.stringify([...this.memoryCache.values()]).length;

    return {
      memoryEntries: this.memoryCache.size,
      diskEntries,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate: Math.round(hitRate * 10000) / 100,
      memorySize,
      lastClear: this.stats.lastClear,
    };
  }

  /**
   * Generate cache key
   */
  private generateKey(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * Ensure disk cache directory exists
   */
  private async ensureDiskCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.diskCachePath, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  /**
   * Get disk cache path for key
   */
  private getDiskCachePath(key: string): string {
    return path.join(this.diskCachePath, `${key}.cache`);
  }

  /**
   * Get entry from disk cache
   */
  private async getDiskCache<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const diskPath = this.getDiskCachePath(key);
      const content = await fs.readFile(diskPath, "utf-8");
      return JSON.parse(content) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  /**
   * Set entry in disk cache
   */
  private async setDiskCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const diskPath = this.getDiskCachePath(key);
      await fs.writeFile(diskPath, JSON.stringify(entry), "utf-8");
    } catch (error) {
      console.error("Failed to write disk cache:", error);
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;

    // Cleanup memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isValid(entry)) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    // Cleanup disk cache
    if (this.enableDiskCache) {
      try {
        const files = await fs.readdir(this.diskCachePath);
        for (const file of files) {
          if (file.endsWith(".cache")) {
            const filePath = path.join(this.diskCachePath, file);
            const content = await fs.readFile(filePath, "utf-8");
            const entry = JSON.parse(content);
            if (!this.isValid(entry)) {
              await fs.unlink(filePath);
              cleaned++;
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }

    return cleaned;
  }

  /**
   * Warm up cache with common operations
   */
  async warmup(files: string[]): Promise<number> {
    let warmed = 0;
    // Implementation depends on what you want to cache
    // This is a placeholder for warmup logic
    return warmed;
  }

  /**
   * Close all file watchers and cleanup
   */
  async close(): Promise<void> {
    for (const [, watcher] of this.fileWatchers) {
      watcher.close();
    }
    this.fileWatchers.clear();
  }
}

// Global cache instance
let globalCache: CacheManager | null = null;

export function getCache(options?: CacheOptions): CacheManager {
  if (!globalCache) {
    globalCache = new CacheManager(options);
  }
  return globalCache;
}

export function resetCache(): void {
  if (globalCache) {
    globalCache.close();
    globalCache = null;
  }
}
