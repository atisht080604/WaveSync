import { io } from 'socket.io-client';

// ─── DEPLOYMENT: set VITE_SOCKET_URL in Vercel env vars ───
// Local dev: create a .env file with VITE_SOCKET_URL=http://localhost:3001
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export const socket = io(SOCKET_URL, {
  // ─── DEPLOYMENT: polling fallback ensures connection works through Vercel's edge ───
  transports: ['websocket', 'polling'],
  autoConnect: false
});
