import { describe, expect, it } from 'vitest';
import { detectSoundEvents } from '../src/hooks/useGameSounds';
import type { RoomState } from '../src/types';

const baseState = (overrides: Partial<RoomState> = {}): RoomState =>
  ({
    serverTime: '2026-01-01T00:00:00.000Z',
    room: {
      id: 'room-1',
      code: 'ABC234',
      status: 'playing',
      mode: 'classic',
      maxRounds: 5,
      hostPlayerId: 'p1',
      playerCount: 2,
    },
    me: {
      playerId: 'p1',
      nickname: 'P1',
      isHost: true,
      isActive: true,
    },
    players: [],
    game: {
      id: 'game-1',
      number: 1,
      mode: 'classic',
      status: 'playing',
      phase: 'question',
      currentRound: 1,
      maxRounds: 5,
      currentPlayerId: 'p1',
      revealUntil: null,
      winnerPlayerId: null,
      lastEliminatedPlayerId: null,
      lastVoteResult: null,
    },
    question: {
      gameQuestionId: 'gq-1',
      prompt: '¿Pregunta?',
      options: ['A', 'B', 'C', 'D'],
      category: 'general',
      difficulty: 'easy',
      round: 1,
      turnIndex: 0,
      servedAt: '2026-01-01T00:00:00.000Z',
      isMine: true,
    },
    lastAnswer: null,
    voting: null,
    race: null,
    results: null,
    ...overrides,
  }) as RoomState;

describe('detección de sonidos', () => {
  it('no suena en la primera carga', () => {
    expect(detectSoundEvents(null, baseState())).toEqual([]);
  });

  it('detecta el cambio de turno en modo clásico', () => {
    const prev = baseState();
    const next = baseState({
      game: {
        ...prev.game!,
        currentPlayerId: 'p2',
      },
      question: {
        ...prev.question!,
        gameQuestionId: 'gq-2',
        round: 2,
        isMine: false,
      },
    });

    expect(detectSoundEvents(prev, next)).toEqual([
      {
        key: 'turn:game-1:gq-2:p2',
        event: 'turn',
      },
    ]);
  });

  it('no repite el sonido si el estado no cambió', () => {
    const state = baseState();
    expect(detectSoundEvents(state, state)).toEqual([]);
  });

  it('detecta respuesta correcta', () => {
    const prev = baseState();
    const next = baseState({
      game: { ...prev.game!, phase: 'reveal' },
      lastAnswer: {
        playerId: 'p1',
        nickname: 'P1',
        selectedIndex: 1,
        correctDisplayIndex: 1,
        correctText: 'B',
        explanation: 'Correcta',
        isCorrect: true,
        points: 150,
        skipped: false,
        answeredAt: '2026-01-01T00:00:05.000Z',
      },
    });

    expect(detectSoundEvents(prev, next)).toEqual([
      {
        key: 'result:game-1:2026-01-01T00:00:05.000Z:true',
        event: 'correct',
      },
    ]);
  });

  it('detecta respuesta incorrecta', () => {
    const prev = baseState();
    const next = baseState({
      game: { ...prev.game!, phase: 'reveal' },
      lastAnswer: {
        playerId: 'p1',
        nickname: 'P1',
        selectedIndex: 0,
        correctDisplayIndex: 1,
        correctText: 'B',
        explanation: 'Incorrecta',
        isCorrect: false,
        points: -100,
        skipped: false,
        answeredAt: '2026-01-01T00:00:06.000Z',
      },
    });

    expect(detectSoundEvents(prev, next)).toEqual([
      {
        key: 'result:game-1:2026-01-01T00:00:06.000Z:false',
        event: 'wrong',
      },
    ]);
  });

  it('detecta el inicio de ronda en modo relámpago', () => {
    const prev = baseState({
      room: { ...baseState().room, mode: 'race' },
      game: {
        ...baseState().game!,
        mode: 'race',
        currentRound: 1,
        currentPlayerId: null,
      },
      race: {
        status: 'open',
        deadlineAt: '2026-01-01T00:00:10.000Z',
        answeredBy: null,
        answeredByNickname: null,
        timedOut: false,
        correctDisplayIndex: null,
        correctText: null,
        explanation: null,
        myAnswer: null,
      },
    });
    const next = baseState({
      ...prev,
      game: { ...prev.game!, currentRound: 2 },
      race: { ...prev.race!, status: 'open' },
    });

    expect(detectSoundEvents(prev, next)).toEqual([
      { key: 'race:game-1:2', event: 'turn' },
    ]);
  });

  it('detecta tiempo agotado en relámpago', () => {
    const prev = baseState({
      room: { ...baseState().room, mode: 'race' },
      game: {
        ...baseState().game!,
        mode: 'race',
        currentPlayerId: null,
      },
      race: {
        status: 'open',
        deadlineAt: '2026-01-01T00:00:10.000Z',
        answeredBy: null,
        answeredByNickname: null,
        timedOut: false,
        correctDisplayIndex: null,
        correctText: null,
        explanation: null,
        myAnswer: null,
      },
    });
    const next = baseState({
      ...prev,
      game: { ...prev.game!, phase: 'reveal' },
      race: {
        ...prev.race!,
        status: 'expired',
        timedOut: true,
        correctDisplayIndex: 1,
        correctText: 'B',
        explanation: 'Correcta',
      },
    });

    expect(detectSoundEvents(prev, next)).toEqual([
      { key: 'timeout:game-1:1', event: 'timeout' },
    ]);
  });
});
