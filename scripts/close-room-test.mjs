#!/usr/bin/env node
/**
 * Prueba el cierre de sala y la salida de jugadores.
 * Crea jugadores/salas de prueba y requiere limpieza posterior.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const text = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const API_URL = `${SUPABASE_URL}/functions/v1/api`;

if (!SUPABASE_URL || !KEY) {
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en .env.local');
  process.exit(1);
}

let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  OK ${message}`);
  } else {
    failures += 1;
    console.error(`  FALLO ${message}`);
  }
}

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

  const response = await fetch(API_URL, {
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

async function expectError(promise, codes, label) {
  const allowed = Array.isArray(codes) ? codes : [codes];
  try {
    await promise;
    check(false, `${label} (no falló)`);
  } catch (error) {
    check(allowed.includes(error.code), `${label} (${error.code})`);
  }
}

async function register(name) {
  const data = await call('register', { nickname: name });
  return { playerId: data.playerId, nickname: data.nickname, token: data.token };
}

const suffix = Date.now().toString(36).slice(-5);
const host = await register(`RclH${suffix}`);
const guest = await register(`RclG${suffix}`);
console.log(`Sala de prueba · prefijo Rcl${suffix}`);

try {
  console.log('\n[1] Cierre en lobby');
  const lobby = await call('room.create', { mode: 'classic', maxRounds: 1 }, host);
  const lobbyRoomId = lobby.room.id;
  await call('room.join', { code: lobby.room.code }, guest);
  await expectError(
    call('room.close', { roomId: lobbyRoomId }, guest),
    'NOT_HOST',
    'un jugador no puede cerrar la sala',
  );
  const closed = await call('room.close', { roomId: lobbyRoomId }, host);
  check(closed.closed === true, 'el anfitrión cierra la sala en lobby');
  await expectError(
    call('game.state', { roomId: lobbyRoomId }, guest),
    ['ROOM_NOT_FOUND', 'NOT_IN_ROOM'],
    'la sala cerrada ya no está disponible',
  );

  console.log('\n[2] Cierre durante la partida');
  const game = await call('room.create', { mode: 'classic', maxRounds: 1 }, host);
  const gameRoomId = game.room.id;
  await call('room.join', { code: game.room.code }, guest);
  const playing = await call('room.start', { roomId: gameRoomId }, host);
  check(playing.room.status === 'playing', 'la partida está en curso');
  await expectError(
    call('room.close', { roomId: gameRoomId }, host),
    'ROOM_IN_PROGRESS',
    'el anfitrión no puede cerrar con jugadores en partida',
  );

  console.log('\n[3] Salida de jugador en cualquier momento');
  const left = await call('room.leave', { roomId: gameRoomId }, guest);
  check(left.left === true, 'el invitado sale durante la partida');
  const afterLeave = await call('game.state', { roomId: gameRoomId }, host);
  const guestInRoom = afterLeave.players.find((player) => player.playerId === guest.playerId);
  check(Boolean(guestInRoom) && guestInRoom.status === 'left', 'la salida queda registrada');

  await call('room.leave', { roomId: gameRoomId }, host);
  await expectError(
    call('game.state', { roomId: gameRoomId }, host),
    ['ROOM_NOT_FOUND', 'NOT_IN_ROOM'],
    'la sala se elimina al quedarse sin jugadores',
  );
} finally {
  console.log(`\nJugadores de prueba: ${host.nickname}, ${guest.nickname}`);
  console.log('Requiere limpieza de jugadores Rcl* al finalizar.');
}

if (failures > 0) {
  console.error(`\n${failures} prueba(s) fallaron.`);
  process.exit(1);
}

console.log('\nTodas las pruebas de cierre y salida pasaron.');
