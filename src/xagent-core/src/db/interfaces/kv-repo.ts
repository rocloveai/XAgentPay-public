/**
 * Key-value repository interface for persistent runtime state.
 */
export interface KVRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
