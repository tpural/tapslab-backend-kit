import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/http/envelope";
import { err, handler, ok, toErrorResponse } from "../src/http/respond";
import { withJobAuth } from "../src/http/job-auth";

describe("envelope", () => {
  it("wraps success data", async () => {
    const body = await ok({ id: "1" }).json();
    expect(body).toEqual({ ok: true, data: { id: "1" } });
  });

  it("maps each error code to its status", () => {
    expect(err("not_found", "gone").status).toBe(404);
    expect(err("validation_failed", "bad").status).toBe(422);
    expect(err("conflict", "dupe").status).toBe(409);
    expect(err("internal", "boom").status).toBe(500);
  });

  it("includes field errors only when given", async () => {
    const withFields = await err("validation_failed", "bad", { title: "Required" }).json();
    expect(withFields.error.fields).toEqual({ title: "Required" });

    const without = await err("not_found", "gone").json();
    expect(without.error).not.toHaveProperty("fields");
  });
});

describe("toErrorResponse", () => {
  it("preserves an AppError's code and message", async () => {
    const res = toErrorResponse(AppError.notFound("Item"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "not_found", message: "Item not found" },
    });
  });

  // The important one: an unexpected error must not leak its message, since
  // that is how stack traces and SQL end up in a browser.
  it("does not leak the message of an unexpected error", async () => {
    const res = toErrorResponse(new Error("SELECT * FROM users WHERE secret = 'hunter2'"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Something went wrong");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("handles a thrown non-Error", async () => {
    const res = toErrorResponse("just a string");
    expect(res.status).toBe(500);
  });
});

describe("handler", () => {
  it("passes a success through untouched", async () => {
    const res = await handler(async () => ok({ n: 1 }))();
    expect(res.status).toBe(200);
  });

  it("converts a thrown AppError into its response", async () => {
    const res = await handler(async () => {
      throw AppError.validation({ title: "Required" });
    })();
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "validation_failed", fields: { title: "Required" } },
    });
  });
});

describe("withJobAuth", () => {
  const request = (token?: string) =>
    new Request("https://x.tapslab.com/api/jobs/digest", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it("runs the handler when the token matches", async () => {
    const fn = vi.fn(async () => ok({ done: true }));
    const res = await handler(withJobAuth(fn, "s3cret"))(request("s3cret"));
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("rejects a wrong token", async () => {
    const fn = vi.fn(async () => ok({ done: true }));
    const res = await handler(withJobAuth(fn, "s3cret"))(request("wrong!"));
    expect(res.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects a missing header", async () => {
    const res = await handler(withJobAuth(async () => ok({}), "s3cret"))(request());
    expect(res.status).toBe(401);
  });

  // Refusing beats allowing: a missing secret in production must not silently
  // open the endpoint to anyone who can reach it.
  it("refuses when no secret is configured", async () => {
    const fn = vi.fn(async () => ok({ done: true }));
    const res = await handler(withJobAuth(fn, undefined))(request("anything"));
    expect(res.status).toBe(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects a token that is a prefix of the secret", async () => {
    const res = await handler(withJobAuth(async () => ok({}), "s3cret"))(request("s3c"));
    expect(res.status).toBe(401);
  });
});
