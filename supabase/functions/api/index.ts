// Edge Function única de "El rival menos peor".
// Autenticación propia por token de jugador; verify_jwt debe estar desactivado.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SECRET_KEY') ??
  '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-player-id, x-player-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ERROR_MESSAGES: Record<string, string> = {
  PLAYER_NOT_FOUND: 'Jugador no encontrado.',
  ROOM_NOT_FOUND: 'La sala no existe.',
  ROOM_NOT_JOINABLE: 'La partida ya comenzó o la sala no admite más jugadores.',
  ALREADY_PLAYING: 'Ya estás en una partida en curso.',
  NICKNAME_TAKEN: 'Ese nickname ya está en uso en esta sala.',
  NOT_HOST: 'Solo el creador de la sala puede hacer esto.',
  ROOM_NOT_IN_LOBBY: 'La sala ya no está en la espera.',
  ROOM_NOT_FINISHED: 'La partida todavía no terminó.',
  NOT_ENOUGH_PLAYERS: 'Faltan jugadores para comenzar.',
  NOT_ENOUGH_QUESTIONS: 'No hay preguntas suficientes para esta configuración.',
  INVALID_MODE: 'Modo de juego inválido.',
  INVALID_ROUNDS: 'La cantidad de turnos debe estar entre 1 y 30.',
  NOT_IN_ROOM: 'No perteneces a esta sala.',
  GAME_NOT_FOUND: 'Partida no encontrada.',
  GAME_NOT_PLAYING: 'La partida no está en curso.',
  NOT_IN_QUESTION: 'No es el momento de responder.',
  NOT_YOUR_TURN: 'No es tu turno.',
  INVALID_OPTION: 'Opción inválida.',
  QUESTION_NOT_AVAILABLE: 'La pregunta ya no está disponible.',
  QUESTION_NOT_FOUND: 'Pregunta no encontrada.',
  NOT_IN_VOTING: 'No es el momento de votar.',
  NOT_ACTIVE_PLAYER: 'No estás activo en esta partida.',
  CANNOT_VOTE_SELF: 'No puedes votarte a ti mismo.',
  INVALID_TARGET: 'Jugador inválido para votar.',
  ALREADY_VOTED: 'Ya votaste en esta ronda.',
  RACE_QUESTION_NOT_FOUND: 'No se encontró la pregunta actual.',
  RACE_ALREADY_ANSWERED: 'Otro jugador respondió primero.',
  RACE_TIME_EXPIRED: 'Se acabó el tiempo para responder.',
  TIME_EXPIRED: 'Se acabó el tiempo para responder.',
  INVITED_OFFLINE: 'Ese jugador no está conectado.',
  INVITED_ALREADY_IN_ROOM: 'Ese jugador ya está en la sala.',
  INVITED_IN_GAME: 'Ese jugador está en una partida en curso.',
  INVITE_NOT_FOUND: 'La invitación no existe.',
  INVITE_NOT_PENDING: 'La invitación ya fue respondida.',
  INVITE_EXPIRED: 'La invitación expiró.',
  INVITE_RATE_LIMIT: 'Has enviado demasiadas invitaciones. Espera un momento.',
  CHAT_EMPTY: 'El mensaje está vacío.',
  CHAT_MESSAGE_TOO_LONG: 'El mensaje no puede superar los 280 caracteres.',
  CHAT_RATE_LIMIT: 'Espera un momento antes de enviar otro mensaje.',
  CHAT_UNAVAILABLE: 'El chat no está disponible en este momento.',
  BROADCAST_FAILED: 'No se pudo enviar el mensaje.',
  INVALID_NICKNAME:
    'El nickname debe tener entre 3 y 16 caracteres: letras, números, espacios, guion, punto o guion bajo.',
  INVALID_SESSION: 'Tu sesión no es válida. Vuelve a ingresar tu nickname.',
  BAD_REQUEST: 'Solicitud inválida.',
  METHOD_NOT_ALLOWED: 'Método no permitido.',
};

class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? code);
    this.code = code;
    this.status = status;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function ok(data: unknown): Response {
  return json({ ok: true, data });
}

function fail(code: string, status = 400, message?: string): Response {
  return json(
    { ok: false, error: { code, message: message ?? ERROR_MESSAGES[code] ?? 'Error inesperado.' } },
    status,
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeNickname(value: unknown): string {
  const nickname = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N} _.-]{3,16}$/u.test(nickname)) {
    throw new ApiError('INVALID_NICKNAME');
  }
  return nickname;
}

type GameMode = 'classic' | 'elimination' | 'race';

function normalizeMode(value: unknown): GameMode {
  return value === 'elimination' || value === 'race' ? value : 'classic';
}

interface AuthPlayer {
  id: string;
  nickname: string;
  token_hash: string;
  country_code: string;
}

interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  countryCode: string;
  body: string;
  createdAt: string;
}

const chatRate = new Map<string, number>();

async function authenticate(req: Request): Promise<AuthPlayer> {
  const playerId = req.headers.get('x-player-id');
  const token = req.headers.get('x-player-token');
  if (!playerId || !token) throw new ApiError('INVALID_SESSION', 401);

  const { data, error } = await admin
    .from('players')
    .select('id, nickname, token_hash, country_code')
    .eq('id', playerId)
    .maybeSingle();

  if (error || !data) throw new ApiError('INVALID_SESSION', 401);

  const hash = await sha256(token);
  if (hash !== data.token_hash) throw new ApiError('INVALID_SESSION', 401);

  await admin.from('players').update({ last_seen_at: new Date().toISOString() }).eq('id', playerId);
  return data as AuthPlayer;
}

async function getState(playerId: string, roomId: string) {
  const { data, error } = await admin.rpc('rpc_get_state', {
    p_player_id: playerId,
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}

async function getRaceState(playerId: string, roomId: string) {
  const { data, error } = await admin.rpc('rpc_get_race_state', {
    p_player_id: playerId,
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}

async function getRoom(roomId: string) {
  const { data, error } = await admin
    .from('rooms')
    .select('id, code, status, mode, max_rounds, host_player_id, current_game_id')
    .eq('id', roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('ROOM_NOT_FOUND', 404);
  return data;
}

async function requireRoomId(body: Record<string, unknown>): Promise<string> {
  const roomId = String(body.roomId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) throw new ApiError('BAD_REQUEST');
  return roomId;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const raw =
    forwarded?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    '';

  if (!raw) return null;

  // IPv4 con puerto
  const ipv4 = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4) return ipv4[1];

  // IPv6 entre corchetes o con puerto
  return raw.replace(/^\[|\]$/g, '').replace(/:\d+$/, '');
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80:')
  );
}

const countryCache = new Map<string, string>();

async function resolveCountry(req: Request): Promise<string> {
  const ip = getClientIp(req);
  if (!ip || isPrivateIp(ip)) return 'UN';

  const cached = countryCache.get(ip);
  if (cached) return cached;

  const timeout = { signal: AbortSignal.timeout(2500) };

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, timeout);
    const data = await response.json();
    if (data?.success && /^[A-Z]{2}$/.test(String(data.country_code ?? ''))) {
      const code = String(data.country_code);
      countryCache.set(ip, code);
      return code;
    }
  } catch {
    // Se intenta el proveedor de respaldo.
  }

  try {
    const response = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, timeout);
    const data = await response.json();
    if (/^[A-Z]{2}$/.test(String(data?.country ?? ''))) {
      const code = String(data.country);
      countryCache.set(ip, code);
      return code;
    }
  } catch {
    // Sin país: se usa el fallback.
  }

  countryCache.set(ip, 'UN');
  if (countryCache.size > 500) countryCache.clear();
  return 'UN';
}

async function broadcastToTopic(topic: string, event: string, payload: unknown): Promise<void> {
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? SERVICE_KEY;
  const response = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages: [{ topic, event, payload }] }),
  });

  if (!response.ok) {
    throw new ApiError('BROADCAST_FAILED', 500, 'No se pudo emitir el mensaje en tiempo real.');
  }
}

async function register(req: Request, body: Record<string, unknown>): Promise<Response> {
  const nickname = normalizeNickname(body.nickname);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const countryCode = await resolveCountry(req);

  const { data, error } = await admin
    .from('players')
    .insert({ nickname, token_hash: tokenHash, country_code: countryCode })
    .select('id, nickname, country_code')
    .single();

  if (error) throw error;

  return ok({
    playerId: data.id,
    nickname: data.nickname,
    countryCode: data.country_code,
    token,
  });
}

async function resume(req: Request, player: AuthPlayer): Promise<Response> {
  const { data: memberships, error } = await admin
    .from('room_players')
    .select('room_id, joined_at')
    .eq('player_id', player.id)
    .eq('status', 'in_room')
    .order('joined_at', { ascending: false });

  if (error) throw error;

  let room: { id: string; code: string; status: string; mode: string; maxRounds: number } | null =
    null;

  if (memberships?.length) {
    const ids = memberships.map((m) => m.room_id);
    const { data: rooms, error: roomsError } = await admin
      .from('rooms')
      .select('id, code, status, mode, max_rounds, updated_at')
      .in('id', ids)
      .in('status', ['lobby', 'playing', 'finished'])
      .order('updated_at', { ascending: false })
      .limit(1);

    if (roomsError) throw roomsError;
    if (rooms?.length) {
      const r = rooms[0];
      room = { id: r.id, code: r.code, status: r.status, mode: r.mode, maxRounds: r.max_rounds };
    }
  }

  let countryCode = player.country_code;
  if (!countryCode || countryCode === 'UN') {
    countryCode = await resolveCountry(req);
    if (countryCode !== 'UN') {
      await admin.from('players').update({ country_code: countryCode }).eq('id', player.id);
    }
  }

  return ok({
    player: { id: player.id, nickname: player.nickname, countryCode },
    room,
  });
}

async function handleRoom(
  action: string,
  body: Record<string, unknown>,
  player: AuthPlayer,
): Promise<Response> {
  if (action === 'room.create') {
    const mode = normalizeMode(body.mode);
    const maxRounds = Number(body.maxRounds ?? 5);
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 30) {
      throw new ApiError('INVALID_ROUNDS');
    }

    const { data, error } = await admin.rpc('rpc_create_room', {
      p_host_id: player.id,
      p_mode: mode,
      p_max_rounds: maxRounds,
    });
    if (error) throw error;

    return ok(await getState(player.id, data.roomId));
  }

  if (action === 'room.join') {
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) throw new ApiError('ROOM_NOT_FOUND', 404);

    const { data, error } = await admin.rpc('rpc_join_room', {
      p_player_id: player.id,
      p_code: code,
    });
    if (error) throw error;

    return ok(await getState(player.id, data.roomId));
  }

  const roomId = await requireRoomId(body);

  if (action === 'room.leave') {
    const { error } = await admin.rpc('rpc_leave_room', {
      p_player_id: player.id,
      p_room_id: roomId,
    });
    if (error) throw error;
    return ok({ left: true });
  }

  if (action === 'room.update') {
    const mode = normalizeMode(body.mode);
    const maxRounds = Number(body.maxRounds ?? 5);
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 30) {
      throw new ApiError('INVALID_ROUNDS');
    }

    const { error } = await admin.rpc('rpc_update_room', {
      p_host_id: player.id,
      p_room_id: roomId,
      p_mode: mode,
      p_max_rounds: maxRounds,
    });
    if (error) throw error;

    return ok(await getState(player.id, roomId));
  }

  if (action === 'room.start') {
    const room = await getRoom(roomId);
    const startRpc = room.mode === 'race' ? 'rpc_start_race_game' : 'rpc_start_game';

    const { error } = await admin.rpc(startRpc, {
      p_host_id: player.id,
      p_room_id: roomId,
    });
    if (error) throw error;

    try {
      await admin
        .from('room_invites')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('status', 'pending');
    } catch (inviteError) {
      console.error('No se pudieron expirar las invitaciones:', inviteError);
    }

    return ok(
      await (room.mode === 'race'
        ? getRaceState(player.id, roomId)
        : getState(player.id, roomId)),
    );
  }

  if (action === 'room.restart') {
    const { error } = await admin.rpc('rpc_restart_room', {
      p_host_id: player.id,
      p_room_id: roomId,
    });
    if (error) throw error;

    return ok(await getState(player.id, roomId));
  }

  throw new ApiError('BAD_REQUEST');
}

async function handleGame(
  action: string,
  body: Record<string, unknown>,
  player: AuthPlayer,
): Promise<Response> {
  const roomId = await requireRoomId(body);
  const room = await getRoom(roomId);

  if (action === 'game.state') {
    return ok(
      await (room.mode === 'race'
        ? getRaceState(player.id, roomId)
        : getState(player.id, roomId)),
    );
  }

  if (action === 'game.raceAnswer') {
    if (room.mode !== 'race') throw new ApiError('BAD_REQUEST');
    if (!room.current_game_id) throw new ApiError('GAME_NOT_FOUND', 404);
    const selectedIndex = Number(body.selectedIndex);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
      throw new ApiError('INVALID_OPTION');
    }

    const { error } = await admin.rpc('rpc_race_answer', {
      p_player_id: player.id,
      p_game_id: room.current_game_id,
      p_selected_index: selectedIndex,
    });
    if (error) throw error;

    return ok(await getRaceState(player.id, roomId));
  }

  if (action === 'game.skipRaceQuestion') {
    if (room.mode !== 'race') throw new ApiError('BAD_REQUEST');
    if (!room.current_game_id) throw new ApiError('GAME_NOT_FOUND', 404);

    const { error } = await admin.rpc('rpc_skip_race_question', {
      p_host_id: player.id,
      p_game_id: room.current_game_id,
    });
    if (error) throw error;

    return ok(await getRaceState(player.id, roomId));
  }

  if (room.mode === 'race') {
    throw new ApiError('BAD_REQUEST');
  }

  if (action === 'game.answer') {
    if (!room.current_game_id) throw new ApiError('GAME_NOT_FOUND', 404);
    const gameQuestionId = String(body.gameQuestionId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(gameQuestionId)) throw new ApiError('BAD_REQUEST');
    const selectedIndex = Number(body.selectedIndex);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
      throw new ApiError('INVALID_OPTION');
    }

    const { error } = await admin.rpc('rpc_submit_answer', {
      p_player_id: player.id,
      p_game_id: room.current_game_id,
      p_game_question_id: gameQuestionId,
      p_selected_index: selectedIndex,
    });
    if (error) throw error;

    return ok(await getState(player.id, roomId));
  }

  if (action === 'game.vote') {
    if (!room.current_game_id) throw new ApiError('GAME_NOT_FOUND', 404);
    const targetPlayerId = String(body.targetPlayerId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(targetPlayerId)) throw new ApiError('INVALID_TARGET');

    const { error } = await admin.rpc('rpc_submit_vote', {
      p_player_id: player.id,
      p_game_id: room.current_game_id,
      p_target_player_id: targetPlayerId,
    });
    if (error) throw error;

    return ok(await getState(player.id, roomId));
  }

  if (action === 'game.skip') {
    if (!room.current_game_id) throw new ApiError('GAME_NOT_FOUND', 404);
    const { error } = await admin.rpc('rpc_skip_turn', {
      p_host_id: player.id,
      p_game_id: room.current_game_id,
    });
    if (error) throw error;
    return ok(await getState(player.id, roomId));
  }

  if (action === 'game.forceVote') {
    if (!room.current_game_id) throw new ApiError('GAME_NOT_FOUND', 404);
    const { error } = await admin.rpc('rpc_force_vote_close', {
      p_host_id: player.id,
      p_game_id: room.current_game_id,
    });
    if (error) throw error;
    return ok(await getState(player.id, roomId));
  }

  throw new ApiError('BAD_REQUEST');
}

async function handlePresence(
  action: string,
  body: Record<string, unknown>,
  player: AuthPlayer,
): Promise<Response> {
  if (action === 'presence.list') {
    const roomId = await requireRoomId(body);
    const { data, error } = await admin.rpc('rpc_presence_list', {
      p_player_id: player.id,
      p_room_id: roomId,
    });
    if (error) throw error;
    return ok(data);
  }

  throw new ApiError('BAD_REQUEST');
}

async function handleInvites(
  action: string,
  body: Record<string, unknown>,
  player: AuthPlayer,
): Promise<Response> {
  if (action === 'invite.create') {
    const roomId = await requireRoomId(body);
    const invitedPlayerId = String(body.invitedPlayerId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(invitedPlayerId)) throw new ApiError('INVALID_TARGET');

    const { data, error } = await admin.rpc('rpc_invite_create', {
      p_inviter_id: player.id,
      p_room_id: roomId,
      p_invited_id: invitedPlayerId,
    });
    if (error) throw error;

    try {
      await broadcastToTopic(`player:${invitedPlayerId}`, 'invite', {
        inviteId: data.inviteId,
      });
    } catch {
      // El polling de invitaciones es el respaldo.
    }

    return ok(data);
  }

  if (action === 'invite.list') {
    const { data, error } = await admin.rpc('rpc_invite_list', {
      p_player_id: player.id,
    });
    if (error) throw error;
    return ok(data);
  }

  if (action === 'invite.respond') {
    const inviteId = String(body.inviteId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(inviteId)) throw new ApiError('INVITE_NOT_FOUND', 404);
    const accept = body.accept === true;

    const { data, error } = await admin.rpc('rpc_invite_respond', {
      p_player_id: player.id,
      p_invite_id: inviteId,
      p_accept: accept,
    });
    if (error) throw error;
    return ok(data);
  }

  throw new ApiError('BAD_REQUEST');
}

async function handleChat(
  action: string,
  body: Record<string, unknown>,
  player: AuthPlayer,
): Promise<Response> {
  if (action !== 'chat.send') throw new ApiError('BAD_REQUEST');

  const roomId = await requireRoomId(body);
  const text = String(body.body ?? '').trim();
  if (!text) throw new ApiError('CHAT_EMPTY');
  if (text.length > 280) throw new ApiError('CHAT_MESSAGE_TOO_LONG');

  const room = await getRoom(roomId);
  if (room.status !== 'playing' || !room.current_game_id) {
    throw new ApiError('GAME_NOT_PLAYING');
  }

  const { data: membership, error: membershipError } = await admin
    .from('room_players')
    .select('player_id')
    .eq('room_id', roomId)
    .eq('player_id', player.id)
    .eq('status', 'in_room')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new ApiError('NOT_IN_ROOM');

  const now = Date.now();
  const last = chatRate.get(player.id) ?? 0;
  if (now - last < 1200) throw new ApiError('CHAT_RATE_LIMIT', 429);
  chatRate.set(player.id, now);
  if (chatRate.size > 500) {
    chatRate.clear();
    chatRate.set(player.id, now);
  }

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    playerId: player.id,
    nickname: player.nickname,
    countryCode: player.country_code || 'UN',
    body: text,
    createdAt: new Date().toISOString(),
  };

  try {
    await broadcastToTopic(`chat:${roomId}`, 'message', message);
  } catch {
    throw new ApiError('CHAT_UNAVAILABLE', 503);
  }

  return ok(message);
}

function mapError(error: unknown): Response {
  if (error instanceof ApiError) {
    return fail(error.code, error.status, error.message);
  }

  const raw = error as { message?: string; code?: string } | null;
  const message = String(raw?.message ?? '');
  const known = Object.keys(ERROR_MESSAGES).find((key) => message.includes(key));
  if (known) {
    if (known === 'CHAT_UNAVAILABLE' || known === 'BROADCAST_FAILED') {
      return fail(known, 503);
    }
    const status =
      known === 'RACE_ALREADY_ANSWERED' ||
      known === 'RACE_TIME_EXPIRED' ||
      known === 'TIME_EXPIRED' ||
      known === 'INVITE_EXPIRED' ||
      known === 'INVITE_NOT_PENDING'
        ? 409
        : 400;
    return fail(known, status);
  }

  if (message.includes('invalid input syntax for type uuid')) {
    return fail('BAD_REQUEST', 400);
  }

  console.error('Edge function error:', raw?.code, message);
  return fail('SERVER_ERROR', 500, 'Ocurrió un error inesperado. Intenta de nuevo.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail('BAD_REQUEST');
  }

  const action = String(body.action ?? '');

  try {
    if (action === 'register') return await register(req, body);

    const player = await authenticate(req);

    if (action === 'resume') return await resume(req, player);
    if (action.startsWith('presence.')) return await handlePresence(action, body, player);
    if (action.startsWith('invite.')) return await handleInvites(action, body, player);
    if (action.startsWith('chat.')) return await handleChat(action, body, player);
    if (action.startsWith('room.')) return await handleRoom(action, body, player);
    if (action.startsWith('game.')) return await handleGame(action, body, player);

    return fail('BAD_REQUEST');
  } catch (error) {
    return mapError(error);
  }
});
