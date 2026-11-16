/**
 * Isolated WebSocket deployment probe.
 *
 * This is NOT the Primer production socket backend. It deliberately performs
 * no OpenAI calls, reads no learning data, and has no session or authorization.
 * Remove it after Vercel's Socket.IO request routing has been verified.
 *
 * Deploy as a separate Vercel Node.js Function (api/socket-probe.ts).
 * The matching Socket.IO client uses path: '/api/socket-probe', transports:
 * ['websocket'], and same-origin URL.
 */
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

const httpServer = createServer((req, res) => {
  // Only a minimal diagnostic; never expose configuration or credentials.
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ service: 'primer-socket-probe', mode: 'diagnostic' }));
});

const io = new SocketIOServer(httpServer, {
  path: '/api/socket-probe',
  addTrailingSlash: false,
  transports: ['websocket'],
  serveClient: false,
});

io.on('connection', socket => {
  socket.emit('probe:ready', { ok: true });

  socket.on('probe:ping', (payload: unknown, acknowledge?: (value: unknown) => void) => {
    // Never echo arbitrary payloads or persist private student content.
    if (typeof acknowledge === 'function') {
      acknowledge({ ok: true, type: typeof payload });
    }
  });
});

export default httpServer;
