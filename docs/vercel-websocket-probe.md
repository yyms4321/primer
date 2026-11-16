# Vercel Socket.IO proof-of-concept validation

Branch: `vercel-compatibility` | Feature: `api/socket-probe.ts`

## Purpose

This isolated endpoint tests whether a Vercel Function can accept a Socket.IO
WebSocket upgrade under this particular Next.js repository's routing. It is
**not** the Primer runtime, does not connect to the OpenAI Realtime API, and
does not persist teaching experiences or learner conversations. Do not claim
the production migration is done merely because this probe connects.

## Deployment prerequisites

- Use the existing separate Vercel project `primer-yyms`, **not** any school production project.
- Deploy an explicit preview from the `vercel-compatibility` branch. Do not
  change the production branch or turn on uncontrolled automatic deployment.
- First verify `next build` succeeds and no secrets are present in Git history.
- For this probe, OpenAI and Google credentials should not be provisioned.
  **Caveat:** the existing Primer app may still require them at build/startup;
  this is a separate unresolved blocker for the full-project preview.
- Vercel Function WebSocket support was GA in October 2026, but function
  lifetime, routing, and per-instance state need real testing.

## Expected test

After a preview deploy, issue a browser-origin Socket.IO connection with:

```ts
import { io } from 'socket.io-client';

const socket = io(window.location.origin, {
  path: '/api/socket-probe',
  addTrailingSlash: false,
  transports: ['websocket'],
  timeout: 10000,
});

socket.on('connect_error', (error) => {
  console.error('Probe failed:', error.message);
});
socket.on('probe:ready', (message) => {
  console.log('Probe handshake:', message);
  socket.emit('probe:ping', 'test', (response: unknown) => {
    console.log('Probe acknowledgement:', response);
    socket.disconnect();
  });
});
```

Success requires both `probe:ready` and a `probe:ping` acknowledgement,
not merely an HTTP 200 or a successful Next.js build. Also test reconnection
and verify that no secrets or student information appear in responses.

## Limitations

- This public, diagnostics-only probe offers no authentication: keep it
  disconnected from learning data and remove it after verification.
- The Socket.IO connection handling and all Primer business events in
  `server.ts` are **not migrated**.
- No real Preview URL exists yet; no real browser test has happened.
- Local filesystem storage and in-memory session state still need migration.
- The existing Next.js project may have builds or routes that are incompatible
  with Vercel. This proof must not be confused with end-to-end compatibility.
