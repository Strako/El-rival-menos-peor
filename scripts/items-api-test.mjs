#!/usr/bin/env node
/**
 * Prueba de integración del sistema de ítems contra la Edge Function.
 * Crea jugadores/salas de prueba; requiere limpieza posterior.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

const env = loadEnv();
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const API = `${URL}/functions/v1/api`;

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
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    const error = new Error(json?.error?.message ?? `HTTP ${response.status}`);
    error.code = json?.error?.code ?? 'UNKNOWN';
    throw error;
  }
  return json.data;
}

async function register(name) {
  const data = await call('register', { nickname: name });
  return { playerId: data.playerId, nickname: data.nickname, token: data.token };
}

function check(condition, label) {
  if (condition) console.log(`  OK ${label}`);
  else {
    console.error(`  FALLO ${label}`);
    process.exitCode = 1;
  }
}

const stamp = Date.now().toString(36).slice(-4);
const a = await register(`Itm${stamp}A`);
const b = await register(`Itm${stamp}B`);
const c = await register(`Itm${stamp}C`);
const d = await register(`Itm${stamp}D`);
console.log(`Jugadores: ${a.nickname}, ${b.nickname}, ${c.nickname}, ${d.nickname}`);

try {
  console.log('\n[1] Sala clásica con ítems');
  const classic = await call(
    'room.create',
    {
      mode: 'classic',
      maxRounds: 1,
      itemsEnabled: false,
      multipleItemsEnabled: false,
    },
    a,
  );
  const updated = await call(
    'room.update',
    {
      roomId: classic.room.id,
      mode: 'classic',
      maxRounds: 1,
      itemsEnabled: true,
      multipleItemsEnabled: true,
    },
    a,
  );
  check(updated.room.itemsEnabled === true, 'actualización itemsEnabled');
  check(updated.room.multipleItemsEnabled === true, 'actualización multipleItemsEnabled');
  await call('room.join', { code: classic.room.code }, b);
  const started = await call('room.start', { roomId: classic.room.id }, a);
  check(started.items.enabled === true, 'estado items.enabled');
  check(Array.isArray(started.question.optionOrder), 'optionOrder en pregunta');
  check(Number.isInteger(started.question.revision), 'revision en pregunta');

  const canonical = Number(started.question.optionOrder[0]);
  const answered = await call(
    'game.answer',
    {
      roomId: classic.room.id,
      gameQuestionId: started.question.gameQuestionId,
      selectedIndex: canonical,
      canonicalIndex: canonical,
      revision: started.question.revision,
    },
    a,
  );
  check(Boolean(answered.lastAnswer), 'respuesta canónica aceptada');

  console.log('\n[2] Relámpago con ítem aleatorio');
  const race = await call(
    'room.create',
    {
      mode: 'race',
      maxRounds: 1,
      itemsEnabled: true,
      multipleItemsEnabled: true,
    },
    c,
  );
  await call('room.join', { code: race.room.code }, d);
  await call('room.start', { roomId: race.room.id }, c);
  const stateA = await call('game.state', { roomId: race.room.id }, c);
  const stateB = await call('game.state', { roomId: race.room.id }, d);
  const holder = stateA.items.myItems.length > 0 ? c : stateB.items.myItems.length > 0 ? d : null;
  const holderState = holder?.playerId === c.playerId ? stateA : stateB;
  check(Boolean(holder), 'un jugador recibe un ítem en la primera ronda');
  check(Array.isArray(stateA.question.optionOrder), 'optionOrder en Relámpago');
  check(Number.isInteger(stateA.question.revision), 'revision en Relámpago');

  if (holder) {
    const item = holderState.items.myItems[0];
    const target = holder.playerId === c.playerId ? d : c;
    const afterUse = await call(
      'game.useItem',
      {
        roomId: race.room.id,
        itemId: item.id,
        targetPlayerId: [1, 2, 3].includes(item.itemType) ? target.playerId : null,
      },
      holder,
    );
    const used = afterUse.items.log.some((event) => event.id === item.id && event.status !== 'held');
    check(used, `ítem ${item.itemType} usado y registrado`);
  }

  console.log(`\nPrefijo de limpieza: Itm${stamp}`);
} catch (error) {
  console.error('Prueba de ítems falló:', error.code, error.message);
  process.exitCode = 1;
}
