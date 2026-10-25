#!/usr/bin/env node
/**
 * Smoke test real contra la Edge Function desplegada.
 * Crea jugadores y salas de prueba. Ejecutar:
 *   node scripts/smoke-test.mjs
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${message}`);
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

async function expectError(promise, code, label) {
  try {
    await promise;
    check(false, `${label} (no falló)`);
  } catch (error) {
    check(error.code === code, `${label} (${error.code})`);
  }
}

async function register(name) {
  const data = await call('register', { nickname: name });
  return { playerId: data.playerId, nickname: data.nickname, token: data.token };
}

async function waitForPhase(session, roomId, phases, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await call('game.state', { roomId }, session);
    if (phases.includes(state.game?.phase) || (phases.includes('finished') && state.room.status === 'finished')) {
      return state;
    }
    await sleep(500);
  }
  throw new Error(`Timeout esperando fase ${phases.join('/')}`);
}

async function getState(session, roomId) {
  return call('game.state', { roomId }, session);
}

async function playClassic(sessions, host, roomId, answerIndex = 0) {
  const start = Date.now();
  let lastPhase = '';
  while (Date.now() - start < 90000) {
    const state = await getState(host, roomId);
    if (state.room.status === 'finished' || state.game?.phase === 'results') {
      return state;
    }

    if (state.game?.phase !== lastPhase) {
      console.log(`  · fase: ${state.game?.phase} (ronda ${state.game?.currentRound}/${state.game?.maxRounds})`);
      lastPhase = state.game?.phase;
    }

    if (state.game?.phase === 'question' && state.question) {
      const current = sessions.find((s) => s.playerId === state.game.currentPlayerId);
      if (!current) throw new Error('No hay sesión para el jugador del turno');
      await call(
        'game.answer',
        {
          roomId,
          gameQuestionId: state.question.gameQuestionId,
          selectedIndex: answerIndex,
        },
        current,
      );
      await sleep(300);
      continue;
    }

    await sleep(700);
  }
  throw new Error('Timeout en partida clásica');
}

async function playElimination(sessions, host, roomId) {
  const start = Date.now();
  let lastPhase = '';
  while (Date.now() - start < 120000) {
    const state = await getState(host, roomId);
    if (state.room.status === 'finished' || state.game?.phase === 'results') {
      return state;
    }

    if (state.game?.phase !== lastPhase) {
      console.log(`  · fase: ${state.game?.phase} (ronda ${state.game?.currentRound}/${state.game?.maxRounds})`);
      lastPhase = state.game?.phase;
    }

    if (state.game?.phase === 'question' && state.question) {
      const current = sessions.find((s) => s.playerId === state.game.currentPlayerId);
      if (!current) throw new Error('No hay sesión para el jugador del turno');
      await call(
        'game.answer',
        {
          roomId,
          gameQuestionId: state.question.gameQuestionId,
          selectedIndex: 0,
        },
        current,
      );
      await sleep(300);
      continue;
    }

    if (state.game?.phase === 'voting' && state.voting) {
      const active = state.players.filter((p) => p.status === 'active');
      for (const player of active) {
        const session = sessions.find((s) => s.playerId === player.playerId);
        const playerState = await getState(session, roomId);
        if (!playerState.voting || playerState.voting.myVoteTargetId) continue;
        const target = playerState.voting.candidates[0];
        if (!target) continue;
        try {
          await call(
            'game.vote',
            { roomId, targetPlayerId: target.playerId },
            session,
          );
        } catch (error) {
          if (error.code !== 'ALREADY_VOTED' && error.code !== 'NOT_IN_VOTING') throw error;
        }
      }
      await sleep(700);
      continue;
    }

    await sleep(700);
  }
  throw new Error('Timeout en partida de eliminación');
}

async function waitForRaceQuestion(session, roomId, round, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState(session, roomId);
    if (state.room.status === 'finished' || state.game?.phase === 'results') return state;
    if (
      state.game?.mode === 'race' &&
      state.game.phase === 'question' &&
      state.game.currentRound === round
    ) {
      return state;
    }
    await sleep(500);
  }
  throw new Error(`Timeout esperando la ronda ${round} de relámpago`);
}

async function waitForRaceReveal(session, roomId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState(session, roomId);
    if (state.game?.phase === 'reveal' || state.game?.phase === 'results') return state;
    await sleep(300);
  }
  throw new Error('Timeout esperando la revelación de relámpago');
}

async function waitForRaceTimeout(session, roomId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState(session, roomId);
    if (state.game?.phase === 'reveal' && state.race?.timedOut) return state;
    if (state.game?.phase === 'results') return state;
    await sleep(500);
  }
  throw new Error('Timeout esperando el tiempo agotado de relámpago');
}

async function waitForRaceResults(session, roomId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState(session, roomId);
    if (state.room.status === 'finished' || state.game?.phase === 'results') return state;
    await sleep(500);
  }
  throw new Error('Timeout esperando los resultados de relámpago');
}

async function main() {
  const stamp = Date.now().toString(36).slice(-5);
  const prefix = `Smk${stamp}`;
  console.log(`\nSmoke test · prefijo ${prefix}`);

  const p1 = await register(`${prefix}A`);
  const p2 = await register(`${prefix}B`);
  const p3 = await register(`${prefix}C`);
  console.log('Jugadores creados.');

  // Sala clásica
  console.log('\n[1] Modo clásico');
  const classic = await call('room.create', { mode: 'classic', maxRounds: 2 }, p1);
  const classicRoomId = classic.room.id;
  await call('room.join', { code: classic.room.code }, p2);
  check((await getState(p1, classicRoomId)).room.playerCount === 2, 'Dos jugadores en la sala');

  await expectError(
    call('room.start', { roomId: classicRoomId }, p2),
    'NOT_HOST',
    'Solo el anfitrión puede iniciar',
  );

  await call('room.start', { roomId: classicRoomId }, p1);
  const classicResult = await playClassic([p1, p2], p1, classicRoomId);
  check(classicResult.room.status === 'finished', 'Partida clásica finalizada');
  check(Boolean(classicResult.results?.winner), 'La partida clásica tiene ganador');
  check(classicResult.results.ranking.length === 2, 'Ranking clásico con 2 jugadores');
  console.log(
    `  Ganador: ${classicResult.results.winner.nickname} (${classicResult.results.winner.score} pts)`,
  );

  await expectError(
    call('room.restart', { roomId: classicRoomId }, p2),
    'NOT_HOST',
    'Solo el anfitrión puede reiniciar',
  );

  const lobby = await call('room.restart', { roomId: classicRoomId }, p1);
  check(lobby.room.status === 'lobby', 'El anfitrión reinició la sala al lobby');
  check(lobby.game === null, 'El lobby no conserva la partida anterior');

  // Sala de eliminación
  console.log('\n[2] Modo eliminación');
  const elimination = await call('room.create', { mode: 'classic', maxRounds: 2 }, p1);
  const eliminationRoomId = elimination.room.id;
  await call('room.join', { code: elimination.room.code }, p2);
  await call('room.join', { code: elimination.room.code }, p3);
  const updated = await call(
    'room.update',
    { roomId: eliminationRoomId, mode: 'elimination', maxRounds: 2 },
    p1,
  );
  check(updated.room.mode === 'elimination', 'Modo cambiado a eliminación');

  await call('room.start', { roomId: eliminationRoomId }, p1);
  const eliminationResult = await playElimination([p1, p2, p3], p1, eliminationRoomId);
  check(eliminationResult.room.status === 'finished', 'Partida de eliminación finalizada');
  check(Boolean(eliminationResult.results?.winner), 'La eliminación tiene ganador');
  check(
    eliminationResult.players.some((player) => player.status === 'eliminated'),
    'Hubo al menos un eliminado',
  );
  console.log(
    `  Ganador: ${eliminationResult.results.winner.nickname} (${eliminationResult.results.winner.score} pts)`,
  );

  // Sala relámpago
  console.log('\n[3] Modo relámpago');
  const race = await call('room.create', { mode: 'race', maxRounds: 3 }, p1);
  const raceRoomId = race.room.id;
  await call('room.join', { code: race.room.code }, p2);
  const raceStarted = await call('room.start', { roomId: raceRoomId }, p1);
  check(raceStarted.room.mode === 'race', 'Modo relámpago iniciado');

  const raceRound1 = await waitForRaceQuestion(p1, raceRoomId, 1);
  const difficulties = [raceRound1.question.difficulty];
  check(raceRound1.game.currentPlayerId === null, 'Relámpago no usa turnos');
  check(Boolean(raceRound1.race?.deadlineAt), 'Relámpago expone el deadline de 10 s');

  const parallel = await Promise.allSettled([
    call('game.raceAnswer', { roomId: raceRoomId, selectedIndex: 0 }, p1),
    call('game.raceAnswer', { roomId: raceRoomId, selectedIndex: 0 }, p2),
  ]);
  const accepted = parallel.filter((result) => result.status === 'fulfilled').length;
  check(accepted === 1, 'Solo la primera respuesta es aceptada');

  const raceReveal1 = await waitForRaceReveal(p1, raceRoomId);
  const answererId = raceReveal1.lastAnswer?.playerId;
  const answererScore = raceReveal1.players.find(
    (player) => player.playerId === answererId,
  )?.score;
  check(
    typeof answererScore === 'number' && Math.abs(answererScore) === 100,
    'La primera respuesta suma +100 o resta -100 (dificultad fácil)',
  );
  const scoresAfterFirst = Object.fromEntries(
    raceReveal1.players.map((player) => [player.playerId, player.score]),
  );

  const raceRound2 = await waitForRaceQuestion(p1, raceRoomId, 2);
  difficulties.push(raceRound2.question.difficulty);
  const raceTimeout = await waitForRaceTimeout(p1, raceRoomId);
  check(raceTimeout.race?.timedOut === true, 'Sin respuesta, la pregunta expira');
  const scoresAfterTimeout = Object.fromEntries(
    raceTimeout.players.map((player) => [player.playerId, player.score]),
  );
  check(
    raceTimeout.players.every(
      (player) => scoresAfterTimeout[player.playerId] === scoresAfterFirst[player.playerId] - 10,
    ),
    'El timeout resta 10 puntos a todos',
  );
  check(raceTimeout.race?.timeoutPenalty === 10, 'El estado informa la penalización de 10');

  const raceRound3 = await waitForRaceQuestion(p1, raceRoomId, 3);
  difficulties.push(raceRound3.question.difficulty);
  check(
    JSON.stringify(difficulties) === JSON.stringify(['easy', 'medium', 'hard']),
    'Dificultad progresiva: fácil → media → difícil',
  );

  await call('game.raceAnswer', { roomId: raceRoomId, selectedIndex: 0 }, p1);
  const raceResult = await waitForRaceResults(p1, raceRoomId);
  check(raceResult.room.status === 'finished', 'Partida relámpago finalizada');
  check(Boolean(raceResult.results?.winner), 'Relámpago tiene ganador');
  check(
    raceResult.players.every((player) => player.status !== 'eliminated'),
    'No hay jugadores eliminados en relámpago',
  );
  console.log(
    `  Ganador: ${raceResult.results.winner.nickname} (${raceResult.results.winner.score} pts)`,
  );

  // Validación de mínimo de jugadores
  console.log('\n[4] Validaciones de inicio');
  const solo = await call('room.create', { mode: 'classic', maxRounds: 1 }, p2);
  await expectError(
    call('room.start', { roomId: solo.room.id }, p2),
    'NOT_ENOUGH_PLAYERS',
    'No se puede iniciar una sala clásica con 1 jugador',
  );

  console.log(`\nResultado: ${failures === 0 ? 'TODO OK' : `${failures} fallo(s)`}`);
  console.log(`Jugadores de prueba: ${prefix}A, ${prefix}B, ${prefix}C`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSmoke test falló:', error.code ?? '', error.message);
  process.exit(1);
});
