import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRepository } from "../src/data/in-memory";
import type { Entity } from "../src/data/repository";

type Item = Entity & { title: string; done: boolean };

let repo: InMemoryRepository<Item>;
let namespace = 0;

beforeEach(() => {
  // Fresh namespace per test: the store is deliberately global so Next's dev
  // reloads do not wipe it, which means tests must not share one.
  repo = new InMemoryRepository<Item>(`test-${namespace++}`);
});

describe("InMemoryRepository", () => {
  it("creates with generated id and timestamps", async () => {
    const item = await repo.create({ title: "Write it down", done: false });
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.createdAt).toBe(item.updatedAt);
    expect(item.title).toBe("Write it down");
  });

  it("reads back what it stored", async () => {
    const created = await repo.create({ title: "A", done: false });
    await expect(repo.get(created.id)).resolves.toEqual(created);
  });

  it("returns null for an unknown id rather than throwing", async () => {
    await expect(repo.get("nope")).resolves.toBeNull();
  });

  it("updates only the given fields and bumps updatedAt", async () => {
    const created = await repo.create({ title: "A", done: false });
    await new Promise((r) => setTimeout(r, 2));

    const updated = await repo.update(created.id, { done: true });
    expect(updated).not.toBeNull();
    expect(updated!.done).toBe(true);
    expect(updated!.title).toBe("A");
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.updatedAt).not.toBe(created.updatedAt);
  });

  it("refuses to let an update rewrite id or createdAt", async () => {
    const created = await repo.create({ title: "A", done: false });
    const updated = await repo.update(created.id, {
      title: "B",
      id: "hacked",
      createdAt: "1999-01-01T00:00:00.000Z",
    } as never);

    expect(updated!.id).toBe(created.id);
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.title).toBe("B");
  });

  it("returns null when updating something that does not exist", async () => {
    await expect(repo.update("nope", { done: true })).resolves.toBeNull();
  });

  it("reports whether a delete removed anything", async () => {
    const created = await repo.create({ title: "A", done: false });
    await expect(repo.delete(created.id)).resolves.toBe(true);
    await expect(repo.delete(created.id)).resolves.toBe(false);
    await expect(repo.get(created.id)).resolves.toBeNull();
  });

  // The stub must not teach a habit that breaks against a real database.
  it("does not hand back a live reference to stored state", async () => {
    const created = await repo.create({ title: "A", done: false });
    created.title = "mutated outside the repository";

    const fetched = await repo.get(created.id);
    expect(fetched!.title).toBe("A");
  });

  it("sorts newest first by default and pages", async () => {
    for (const title of ["A", "B", "C"]) {
      await repo.create({ title, done: false });
      await new Promise((r) => setTimeout(r, 2));
    }

    const all = await repo.list();
    expect(all.total).toBe(3);
    expect(all.items.map((i) => i.title)).toEqual(["C", "B", "A"]);

    const page = await repo.list({ limit: 2, offset: 1 });
    expect(page.items.map((i) => i.title)).toEqual(["B", "A"]);
    // total is the full count, not the page size -- pagination UIs need it.
    expect(page.total).toBe(3);
  });

  it("sorts ascending by an arbitrary field", async () => {
    await repo.create({ title: "C", done: false });
    await repo.create({ title: "A", done: false });
    await repo.create({ title: "B", done: false });

    const sorted = await repo.list({ sortBy: "title", order: "asc" });
    expect(sorted.items.map((i) => i.title)).toEqual(["A", "B", "C"]);
  });

  it("refuses to grow past maxItems", async () => {
    const capped = new InMemoryRepository<Item>(`test-${namespace++}`, [], { maxItems: 2 });
    await capped.create({ title: "one", done: false });
    await capped.create({ title: "two", done: false });

    await expect(capped.create({ title: "three", done: false })).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await capped.list()).total).toBe(2);
  });

  it("counts the seed against the cap", async () => {
    const seed = [
      { id: "a", title: "seeded", done: false, createdAt: "", updatedAt: "" },
    ] as Item[];
    const capped = new InMemoryRepository<Item>(`test-${namespace++}`, seed, { maxItems: 1 });

    await expect(capped.create({ title: "nope", done: false })).rejects.toThrow();
  });
});
