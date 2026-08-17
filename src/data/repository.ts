/**
 * The data seam.
 *
 * The template ships with no database, but the CRUD it demonstrates is written
 * against this interface rather than against an array. When a project earns a
 * real database, the work is one new implementation of `Repository<T>` and a
 * one-line swap at the composition root -- not a rewrite of every route.
 *
 * The interface is deliberately narrow. Anything richer (joins, aggregates,
 * partial indexes) is a sign the project has outgrown the stub and should be
 * talking to Drizzle directly, and pretending otherwise behind a generic
 * interface is how you end up building a bad ORM.
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
