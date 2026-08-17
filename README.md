# @tpural/backend-kit

Server-side helpers shared by tapslab projects. Ships TypeScript source, no build step.

```jsonc
"@tpural/backend-kit": "^0.2.0"
```

Published to GitHub Packages; see the
`.npmrc` and access notes in the tapslab-template README.

Add it to `transpilePackages` in `next.config.ts`.

> Published to **GitHub Packages** from a private repo. CI needs no PAT — `GITHUB_TOKEN`
> works once this package grants the consuming repo read access. Locally:
> `gh auth refresh -s read:packages && export NODE_AUTH_TOKEN=$(gh auth token)`.

## What's in it

### Response envelope

Every endpoint answers with the same discriminated shape, so a client that checks `res.ok`
gets `data` narrowed and cannot reach for `error` on a success.

```ts
{ ok: true,  data: T }
{ ok: false, error: { code, message, fields? } }
```

`AppError` carries its own HTTP semantics, so you can throw from anywhere in a call stack:

```ts
export const GET = handler(async (_req, { params }) => {
  const item = await repo.get((await params).id);
  if (!item) throw AppError.notFound("Item");
  return ok(item);
});
```

`handler()` catches everything. An `AppError` becomes its mapped status; anything else logs
the real cause and returns a generic 500 — **an unexpected error's message is never sent to
the client**, because that is how stack traces and SQL end up in a browser.

The code-to-status mapping lives in one place (`STATUS_BY_CODE`), which is what stops the
same condition returning 400 in one route and 422 in another.

### Health

```ts
export const GET = createHealthHandler({
  version: process.env.APP_VERSION,
  checks: [{ name: "db", check: () => sql`select 1` }],
});
```

Reports `APP_VERSION` so you can tell which build a pod is running without shelling into it.
Checks are bounded by a timeout — an unbounded dependency check turns a slow database into a
liveness failure, and kubelet then restarts a pod that was only waiting. Responses are
`no-store`, since a cached health check would report a dead pod as alive.

### Job auth

```ts
export const POST = handler(withJobAuth(async () => {
  await materialise();
  return ok({ done: true });
}));
```

Bearer check against `CRON_SECRET`, for the `/api/jobs/*` endpoints that Kubernetes CronJobs
curl. Comparison is constant-time, and a **missing** secret refuses rather than allows.

### Config

```ts
const config = loadConfig({
  DATABASE_URL: env.string(),
  PORT: env.withDefault(env.number(), 8080),
  STAGE: env.enum(["dev", "prod"] as const),
});
```

Fails at boot, not at first request — so a missing variable fails the rollout instead of
letting a green-looking deploy serve errors. Reports every problem at once, because one
restart per missing variable is a miserable way to fix a deploy.

### Repository

`Repository<T>` plus `InMemoryRepository<T>`: the seam a real database slots into. Deliberately
narrow — anything richer is a sign the project should talk to Drizzle directly.

The in-memory implementation deep-clones in and out, so a caller cannot mutate stored state
without going through `update()`. That works fine in a stub and breaks against a real
database, which is exactly the habit a stub should not teach.

## Scripts

| Command | Does |
| --- | --- |
| `npm test` | vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | both — what CI runs |
