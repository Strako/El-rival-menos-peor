#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const API = `${env.VITE_SUPABASE_URL}/functions/v1/api`;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const stamp = Date.now().toString(36).slice(-4);

async function call(action, payload, session) {
  const h = { ...headers };
  if (session) {
    h['x-player-id'] = session.playerId;
    h['x-player-token'] = session.token;
  }
  const response = await fetch(API, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    const error = new Error(`${action}: ${json.error?.code} ${json.error?.message}`);
    error.code = json.error?.code;
    throw error;
  }
  return json.data;
}

const a = await call('register', { nickname: `ChA${stamp}` });
const b = await call('register', { nickname: `ChB${stamp}` });
const sa = { playerId: a.playerId, nickname: a.nickname, token: a.token };
const sb = { playerId: b.playerId, nickname: b.nickname, token: b.token };
const room = await call('room.create', { mode: 'classic', maxRounds: 1 }, sa);
await call('room.join', { code: room.room.code }, sb);
const started = await call('room.start', { roomId: room.room.id }, sa);

console.log('Sala:', room.room.code, '| deadline:', started.question?.deadlineAt, '| país:', a.countryCode);

const supabase = createClient(env.VITE_SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let received = null;
const channel = supabase
  .channel(`chat:${room.room.id}`)
  .on('broadcast', { event: 'message' }, (payload) => {
    received = payload.payload;
    console.log('Mensaje recibido:', payload.payload);
  })
  .subscribe(async (status) => {
    console.log('Canal:', status);
    if (status !== 'SUBSCRIBED') return;

    const message = await call('chat.send', { roomId: room.room.id, body: 'Hola desde el test' }, sa);
    console.log('Mensaje enviado:', message);
  });

await new Promise((resolve) => setTimeout(resolve, 8000));
console.log(`\nChat: ${received ? 'OK' : 'NO RECIBIDO'}`);
console.log(`Timer: ${started.question?.deadlineAt ? 'OK' : 'FALTA'}`);
console.log(`Jugadores: ChA${stamp}, ChB${stamp}`);
await supabase.removeChannel(channel);
process.exit(received && started.question?.deadlineAt ? 0 : 1);
