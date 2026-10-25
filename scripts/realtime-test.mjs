#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const env = Object.fromEntries(
  text
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

async function call(action, payload, session) {
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };
  if (session) {
    headers['x-player-id'] = session.playerId;
    headers['x-player-token'] = session.token;
  }
  const response = await fetch(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error?.message ?? 'Error');
  return json.data;
}

async function broadcastRoom(roomId) {
  await fetch(`${env.VITE_SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `room:${roomId}`,
          event: 'sync',
          payload: { roomId },
        },
      ],
    }),
  });
}

const stamp = Date.now().toString(36).slice(-4);
const p1 = await call('register', { nickname: `Rt${stamp}A` });
const session = { playerId: p1.playerId, nickname: p1.nickname, token: p1.token };
const roomState = await call('room.create', { mode: 'classic', maxRounds: 2 }, session);
const roomId = roomState.room.id;
console.log('Sala de prueba:', roomState.room.code, roomId);

const supabase = createClient(env.VITE_SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let received = false;
const channel = supabase
  .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
  .on('broadcast', { event: 'sync' }, (payload) => {
    received = true;
    console.log('Broadcast de sala recibido:', payload);
  })
  .subscribe(async (status) => {
    console.log('Estado del canal:', status);
    if (status !== 'SUBSCRIBED') return;

    setTimeout(async () => {
      console.log('Actualizando sala y emitiendo ping…');
      await call('room.update', { roomId, mode: 'classic', maxRounds: 3 }, session);
      await broadcastRoom(roomId);
    }, 500);
  });

await new Promise((resolve) => setTimeout(resolve, 10000));

console.log(`\nRealtime Broadcast: ${received ? 'OK' : 'NO RECIBIDO'}`);
await supabase.removeChannel(channel);
process.exit(received ? 0 : 1);
