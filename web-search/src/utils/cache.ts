import { mkdir, readFile, writeFile, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

export interface CacheOptions {
  dir: string;
  ttlMs: number;
  cleanupIntervalMs?: number;
}

export class Cache<T> {
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly cleanupIntervalMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options: CacheOptions) {
    this.dir = options.dir;
    this.ttlMs = options.ttlMs;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 5 * 60 * 1000;
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    const hash = createHash("sha256").update(key, "utf8").digest("hex");
    return join(this.dir, `${hash}.json`);
  }

  async read(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);
    if (!existsSync(filePath)) return null;
    try {
      const raw = await readFile(filePath, "utf-8");
      const { expiresAt, data } = JSON.parse(raw) as { expiresAt: number; data: T };
      if (Date.now() < expiresAt) return data;
      return null;
    } catch {
      return null;
    }
  }

  async write(key: string, data: T): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(key);
    const payload = JSON.stringify({ expiresAt: Date.now() + this.ttlMs, data });
    await writeFile(filePath, payload, "utf-8");
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    if (existsSync(filePath)) {
      await unlink(filePath).catch(() => {});
    }
  }

  async cleanup(): Promise<number> {
    if (!existsSync(this.dir)) return 0;
    const now = Date.now();
    let deleted = 0;
    try {
      const files = await readdir(this.dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.dir, file);
        try {
          const raw = await readFile(filePath, "utf-8");
          const { expiresAt } = JSON.parse(raw) as { expiresAt: number };
          if (now >= expiresAt) {
            await unlink(filePath);
            deleted++;
          }
        } catch {
          await unlink(filePath).catch(() => {});
          deleted++;
        }
      }
    } catch (err) {
      console.error("[WARN] cache cleanup failed:", err);
    }
    return deleted;
  }

  startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(() => {});
    }, this.cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

export function createCache<T>(options: CacheOptions): Cache<T> {
  return new Cache<T>(options);
}
