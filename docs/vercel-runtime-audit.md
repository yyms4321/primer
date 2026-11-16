# Vercel migration: verified runtime dependency map

**Status:** source-level audit only, no functional port or deployment completed. Branch: `vercel-compatibility`.

## Request and event path

1. The browser's `src/app/components/SocketController.tsx` imports `socket.io-client` and connects to `NEXT_PUBLIC_SOCKET_SERVER_URL` (falling back to `http://localhost:3000`) at `/api/socketio` with both WebSocket and polling transports.
2. `server.ts` starts a **custom** HTTP server with `createServer`, calls `next()` / `getRequestHandler()`, and attaches a Socket.IO server on `/api/socketio`. Its `npm start` entrypoint is `tsx server.ts`.
3. `server.ts` tracks socket sessions using `InMemorySessionStore` backed by `Map`; there are also socket-local connection registrations and session reconnection behavior.
4. `src/app/lib/backend-agent-socket.ts` uses a passed Socket.IO socket to publish agent/tool status and responses. Its per-session/agent circuit-breaker counter is also an in-memory `Map`.
5. `src/app/api/session/route.ts` issues **short-lived OpenAI Realtime client secrets** via the OpenAI API. This route is conceptually compatible with a Next.js Function, subject to authenticated access, rate limits, and real tests.

## Data path

- `src/app/lib/storage/StorageServiceFactory.ts` only accepts storage type `local` and constructs `LocalStorageService` at `STORAGE_ROOT_PATH` or `<cwd>/storage`.
- `docs/extending/adding-a-database.md` details replacing the filesystem storage with PostgreSQL/Prisma + object storage. The proposed schema is a starting point, not a complete tested migration.
- Persistently saved experience configurations, module assets, session data, and user roles must be mapped to durable storage before production. Simply changing a path to `/tmp` would not work.

## Deployment decisions to make and test

- **Socket transport:** Vercel Functions now support WebSockets (GA October 20, 2026), including Socket.IO, but the existing `server.ts` cannot be presumed to run unchanged in Vercel's Next.js adapter. Implement a Function-compatible socket entrypoint and verify that *all* Primer events still work. See https://vercel.com/changelog/websocket-support-is-now-generally-available
- **Function lifetime:** Connections are pinned to a Function invocation for its maximum duration. Different connections may arrive on different instances; rely on durable session data, not only the process-local `Map`. See https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- **Frontend:** The current socket URL fallback `http://localhost:3000` is not a usable deployed fallback. Configure a fully qualified public URL, and review CORS / CSP handling.
- **Storage:** Use a newly provisioned storage/database project, separate from existing school projects. The exact integration must be evaluated and tested. Never copy existing student data into the prototype.
- **Authentication:** Set Google OAuth allowed redirect URL / callback and protect routes that can mint paid Realtime sessions.
- **Testing:** Start with a clean Next.js build and unit tests; then exercise sign-in, module install, teacher experience creation, practice, audio, feedback, reconnect, and persistence across restarts. Next perform concurrency and cost checks.

## Minimal proof of concept acceptance criteria

- Login works using a test account.
- Experience Creator and both Roleplay and Teachback modules load.
- A teacher can create and reload an experience.
- A learner can complete one realtime exchange and receive grounded feedback.
- Sessions can reconnect, and persisted data survives Function recycling.
- API key never appears in browser output or committed files.
- No impact on existing school production resources.

**Do not merge or deploy until those criteria are satisfied.**
