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

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const topic = `test-broadcast-${Date.now()}`;

const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let received = false;
const channel = supabase
  .channel(topic)
  .on('broadcast', { event: 'ping' }, (payload) => {
    received = true;
    console.log('Broadcast recibido:', payload);
  })
  .subscribe(async (status) => {
    console.log('Canal:', status);
    if (status !== 'SUBSCRIBED') return;

    const response = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic, event: 'ping', payload: { hello: 'world' } }],
      }),
    });
    console.log('HTTP broadcast:', response.status, await response.text());
  });

await new Promise((resolve) => setTimeout(resolve, 10000));
console.log(`\nBroadcast: ${received ? 'OK' : 'NO RECIBIDO'}`);
await supabase.removeChannel(channel);
process.exit(received ? 0 : 1);
