import { randomUUID } from "node:crypto";
import { AppError } from "../http/envelope";
import type {
  CreateInput,
  Entity,
  ListOptions,
  Page,
  Repository,
  UpdateInput,
} from "./repository";

/**
 * Stand-in until a project needs a real database.
 *
 * Deep-clones in and out: handing back a live reference lets a caller mutate
 * stored state without `update()`, which works here and breaks against a real
 * database -- the class of bug a stub should not teach.
 *
 * State lives on globalThis so Next's dev reloads do not wipe it. Not
 * persistence: a restart loses everything and two replicas never agree.
 */
export class InMemoryRepository<T extends Entity> implements Repository<T> {
  private readonly store: Map<string, T>;
  private readonly maxItems: number;

  /**
   * `maxItems` bounds the store because this one lives in process memory: an
   * unauthenticated create loop against a deployed instance would otherwise
   * grow it until the pod is OOM-killed. A real database would push this to a
   * quota or a rate limit rather than the repository.
   */
  constructor(namespace: string, seed: T[] = [], { maxItems = 1000 } = {}) {
    const key = `__tapslab_repo_${namespace}`;
    const globals = globalThis as Record<string, unknown>;
    if (!globals[key]) {
      globals[key] = new Map(seed.map((item) => [item.id, structuredClone(item)]));
    }
    this.store = globals[key] as Map<string, T>;
    this.maxItems = maxItems;
  }

  async list(options: ListOptions<T> = {}): Promise<Page<T>> {
    const { limit, offset = 0, sortBy = "createdAt" as keyof T, order = "desc" } = options;

    const items = [...this.store.values()].sort((a, b) => {
      const [x, y] = [a[sortBy], b[sortBy]];
      if (x === y) return 0;
      const ascending = x < y ? -1 : 1;
      return order === "asc" ? ascending : -ascending;
    });

    const window = limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit);
    // Not `.map(structuredClone)`: map passes the index as the second
    // argument, which structuredClone reads as its options bag.
    return { items: window.map((item) => structuredClone(item)), total: items.length };
  }

  async get(id: string): Promise<T | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async create(input: CreateInput<T>): Promise<T> {
    if (this.store.size >= this.maxItems) {
      throw new AppError("conflict", `This store holds at most ${this.maxItems} items`);
    }

    const now = new Date().toISOString();
    const entity = {
      ...structuredClone(input),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as T;
    this.store.set(entity.id, entity);
    return structuredClone(entity);
  }

  async update(id: string, input: UpdateInput<T>): Promise<T | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    // id/createdAt are re-applied after the spread so a caller cannot rewrite
    // them by passing them through, which a real database would reject anyway.
    const updated = {
      ...existing,
      ...structuredClone(input),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    } as T;
    this.store.set(id, updated);
    return structuredClone(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
