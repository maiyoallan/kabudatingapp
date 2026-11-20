import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { isAllowedIp, normalizeIp } from './network.js';

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const ALLOWED_CIDRS = (process.env.ALLOWED_CIDRS || '').split(',').map(s => s.trim()).filter(Boolean);
const SESSION_TTL_MS = Math.max(30_000, Number(process.env.SESSION_TTL_MS || 90_000));
const MAX_MESSAGE_LENGTH = Math.min(2000, Math.max(1, Number(process.env.MAX_MESSAGE_LENGTH || 1000)));
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN.split(',').map(s => s.trim()), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5,
  pingInterval: 20_000,
  pingTimeout: 20_000
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: CLIENT_ORIGIN.split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'KABU DATING APP', mode: 'ephemeral' }));

// All live state is held in memory and disappears when the server restarts.
const users = new Map(); // socketId -> public user/session data
const conversations = new Map(); // conversationId -> { members, messages }
const pendingRequests = new Map(); // targetSocketId -> requesterSocketId
const blockedPairs = new Set();
const wordsA = ['Amber','Brave','Cosmic','Daring','Echo','Golden','Indigo','Jolly','Lunar','Misty','Neon','Quiet','Silver','Velvet','Wild'];
const wordsB = ['Badger','Comet','Dolphin','Falcon','Fox','Koala','Lion','Otter','Panda','Raven','Tiger','Wolf','Robin','Orchid','Maple'];
const choose = list => list[crypto.randomInt(list.length)];
function createUsername() { return `${choose(wordsA)}${choose(wordsB)}${crypto.randomInt(10, 100)}`; }
function publicUser(user) { return { id: user.id, username: user.username, gender: user.gender, online: true, busy: Boolean(user.conversationId) }; }
function emitPresence() {
  const list = [...users.values()].map(publicUser);
  io.emit('presence:list', list);
}
function pairKey(a, b) { return [a, b].sort().join(':'); }
function removeRequestFor(socketId) {
  const requester = pendingRequests.get(socketId);
  if (requester) { io.to(requester).emit('chat:declined', { reason: 'User is no longer available.' }); pendingRequests.delete(socketId); }
  for (const [target, from] of pendingRequests) if (from === socketId) { pendingRequests.delete(target); io.to(target).emit('chat:request-cancelled'); }
}
function endConversation(conversationId, reason = 'ended') {
  const convo = conversations.get(conversationId);
  if (!convo) return;
  conversations.delete(conversationId); // Drop message array immediately.
  for (const memberId of convo.members) {
    const user = users.get(memberId);
    if (user) { user.conversationId = null; io.to(memberId).emit('chat:ended', { reason }); }
  }
  emitPresence();
}
function endUserConversation(socketId, reason) {
  const user = users.get(socketId);
  if (user?.conversationId) endConversation(user.conversationId, reason);
}

io.use((socket, next) => {
  const ip = normalizeIp(socket.handshake.address || '');
  if (!isAllowedIp(ip, ALLOWED_CIDRS)) return next(new Error('This network is not authorized for KABU.'));
  const origin = socket.handshake.headers.origin;
  const allowedOrigins = CLIENT_ORIGIN.split(',').map(s => s.trim());
  if (origin && !allowedOrigins.includes(origin)) return next(new Error('Origin not allowed.'));
  next();
});

io.on('connection', socket => {
  const ip = normalizeIp(socket.handshake.address || '');
  socket.on('user:join', (payload = {}, ack = () => {}) => {
    if (users.has(socket.id)) return ack({ ok: false, error: 'Already joined.' });
    const gender = ['boy', 'girl', 'unspecified'].includes(payload.gender) ? payload.gender : 'unspecified';
    const username = createUsername();
    const user = { id: socket.id, username, gender, joinedAt: Date.now(), lastSeen: Date.now(), conversationId: null, ip };
    users.set(socket.id, user);
    ack({ ok: true, user: publicUser(user), ttlMs: SESSION_TTL_MS });
    emitPresence();
  });

  socket.on('presence:get', ack => { if (typeof ack === 'function') ack([...users.values()].filter(u => u.id !== socket.id).map(publicUser)); });

  socket.on('chat:request', ({ targetId } = {}, ack = () => {}) => {
    const from = users.get(socket.id); const target = users.get(targetId);
    if (!from || !target || targetId === socket.id) return ack({ ok: false, error: 'That user is unavailable.' });
    if (from.conversationId || target.conversationId) return ack({ ok: false, error: 'One of you is already chatting.' });
    if (pendingRequests.has(targetId) || [...pendingRequests.values()].includes(socket.id)) return ack({ ok: false, error: 'A chat request is already pending.' });
    if (blockedPairs.has(pairKey(socket.id, targetId))) return ack({ ok: false, error: 'This connection is unavailable.' });
    pendingRequests.set(targetId, socket.id);
    io.to(targetId).emit('chat:incoming', { from: publicUser(from), requestId: socket.id });
    ack({ ok: true });
  });

  socket.on('chat:respond', ({ requestId, accept } = {}, ack = () => {}) => {
    const requesterId = pendingRequests.get(socket.id);
    if (!requesterId || requesterId !== requestId || !users.has(requesterId) || !users.has(socket.id)) return ack({ ok: false, error: 'This request has expired.' });
    pendingRequests.delete(socket.id);
    const requester = users.get(requesterId); const recipient = users.get(socket.id);
    if (!accept) { io.to(requesterId).emit('chat:declined', { reason: 'Your request was declined.' }); return ack({ ok: true }); }
    if (requester.conversationId || recipient.conversationId) { io.to(requesterId).emit('chat:declined', { reason: 'User is no longer available.' }); return ack({ ok: false, error: 'User is no longer available.' }); }
    const conversationId = crypto.randomUUID();
    conversations.set(conversationId, { members: [requesterId, socket.id], messages: [], createdAt: Date.now() });
    requester.conversationId = conversationId; recipient.conversationId = conversationId;
    for (const id of [requesterId, socket.id]) {
      const peer = id === requesterId ? recipient : requester;
      io.to(id).emit('chat:started', { conversationId, peer: publicUser(peer) });
    }
    emitPresence(); ack({ ok: true });
  });

  socket.on('chat:message', ({ text } = {}, ack = () => {}) => {
    const user = users.get(socket.id); const convo = user?.conversationId ? conversations.get(user.conversationId) : null;
    if (!convo) return ack({ ok: false, error: 'No active conversation.' });
    if (typeof text !== 'string') return ack({ ok: false, error: 'Message must be text.' });
    const clean = text.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, MAX_MESSAGE_LENGTH);
    if (!clean) return ack({ ok: false, error: 'Message is empty.' });
    const message = { id: crypto.randomUUID(), senderId: socket.id, senderName: user.username, text: clean, sentAt: Date.now() };
    convo.messages.push(message);
    if (convo.messages.length > 500) convo.messages.shift();
    for (const id of convo.members) io.to(id).emit('chat:message', message);
    ack({ ok: true });
  });

  socket.on('chat:typing', ({ typing } = {}) => {
    const user = users.get(socket.id); const convo = user?.conversationId ? conversations.get(user.conversationId) : null;
    if (convo) for (const id of convo.members) if (id !== socket.id) io.to(id).emit('chat:typing', { typing: Boolean(typing), username: user.username });
  });

  socket.on('chat:end', () => endUserConversation(socket.id, 'ended'));
  socket.on('user:heartbeat', () => { const user = users.get(socket.id); if (user) user.lastSeen = Date.now(); });
  socket.on('user:block', ({ targetId } = {}, ack = () => {}) => {
    if (!users.has(socket.id) || !users.has(targetId) || targetId === socket.id) return ack({ ok: false, error: 'Invalid user.' });
    blockedPairs.add(pairKey(socket.id, targetId));
    if (users.get(socket.id)?.conversationId) endUserConversation(socket.id, 'blocked');
    ack({ ok: true });
  });
  socket.on('user:report', ({ targetId, reason } = {}, ack = () => {}) => {
    if (!users.has(socket.id) || !users.has(targetId) || typeof reason !== 'string' || !reason.trim()) return ack({ ok: false, error: 'Please provide a reason.' });
    // Deliberately do not retain message contents or reporter identity. A production deployment should route abuse reports to a trusted moderator workflow.
    console.warn(`[safety-report] report received; reason length=${Math.min(reason.trim().length, 200)}`);
    ack({ ok: true });
  });

  socket.on('disconnect', () => {
    endUserConversation(socket.id, 'disconnected');
    removeRequestFor(socket.id);
    users.delete(socket.id);
    emitPresence();
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, user] of users) {
    if (now - user.lastSeen > SESSION_TTL_MS) {
      endUserConversation(id, 'expired');
      removeRequestFor(id);
      users.delete(id);
      io.to(id).disconnectSockets(true);
    }
  }
  emitPresence();
}, 15_000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`KABU server listening on http://0.0.0.0:${PORT}`));
