# Primer Vercel compatibility work plan

Status: assessment only. No runtime behavior changed.

## Scope and safeguards

- Preserve `main` and original Primer behavior.
- Work on `vercel-compatibility` only until reviewed.
- Do not deploy production, migrate user data, or connect school resources during the initial proof of concept.
- Use separate credentials and resources; never commit secrets.

## Verified repository facts

- `package.json`: `build` runs `next build`, but `start` runs `tsx server.ts`.
- `server.ts`: creates a custom Node HTTP server, Next.js request handler, and Socket.IO server together at `/api/socketio`; tracks live sessions in an in-memory Map.
- `docs/extending/adding-a-database.md`: experience storage uses local filesystem via `LocalStorageService` and `StorageServiceFactory`.
- `render.yaml`: documents a conventional persistent Node process and environment variables for Render.

## Confirmed Vercel capabilities and constraints (2026-11)

- Vercel Functions added native WebSocket support (GA 2026-10-20), including Socket.IO: https://vercel.com/changelog/websocket-support-is-now-generally-available
- Connections are pinned to an invocation only for the Function duration. Reconnect behavior and durable shared state must be implemented: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- A repository designed to boot a custom long-running Node server cannot be assumed to deploy unchanged through Vercel's Next.js integration.

## Required steps

1. Map how `server.ts`, `/api/socketio`, and frontend socket clients exchange events.
2. Prototype a Vercel Function-compatible Socket.IO entrypoint while retaining the existing local / Render startup path.
3. Move persistent experience configs, user roles, sessions, and assets out of local filesystem storage. Evaluate dedicated Supabase project (PostgreSQL + object storage) without touching any existing school database.
4. Replace in-memory-only session authority with durable/shared state and implement reconnection.
5. Verify NextAuth/Google callback configuration, authorization, environment variables, and origin security.
6. Test build, teacher login, module install, experience authoring, Teachback/Roleplay audio, feedback, reconnect, data retention, and multiple concurrent users.
7. Only after tests and review, create a separate Vercel project and deploy a preview.

## Open issues

- A fresh Vercel build and live end-to-end test have **not** yet been run.
- Model API credentials, authentication settings, storage provider, and hosting project remain unconfigured.
- Full compatibility and actual costs are not established.

This document is a technical plan, not a claim that Primer is already Vercel-ready.
