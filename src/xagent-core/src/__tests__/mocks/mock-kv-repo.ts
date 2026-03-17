import type { KVRepository } from "../../db/interfaces/kv-repo.js";

export class MockKVRepository implements KVRepository {
  private readonly store = new Map<string, string>();

  clear(): void {
    this.store.clear();
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}
