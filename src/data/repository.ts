/**
 * The data seam. Swapping in a real database is one new implementation plus a
 * one-line change at the composition root, not a rewrite of every route.
 *
 * Deliberately narrow: anything needing joins or aggregates has outgrown this
 * and should talk to Drizzle directly, rather than growing a bad ORM here.
 */

export type Entity = { id: string; createdAt: string; updatedAt: string };

/** The caller supplies the domain fields; the repository owns the rest. */
export type CreateInput<T extends Entity> = Omit<T, keyof Entity>;
export type UpdateInput<T extends Entity> = Partial<CreateInput<T>>;

export type ListOptions<T extends Entity> = {
  limit?: number;
  offset?: number;
  sortBy?: keyof T;
  order?: "asc" | "desc";
};

export type Page<T> = { items: T[]; total: number };

export interface Repository<T extends Entity> {
  list(options?: ListOptions<T>): Promise<Page<T>>;
  get(id: string): Promise<T | null>;
  create(input: CreateInput<T>): Promise<T>;
  /** Resolves null when the id does not exist, so callers can 404 explicitly. */
  update(id: string, input: UpdateInput<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}
