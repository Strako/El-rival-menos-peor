import { useEffect, useRef } from 'react';
import {
  playCorrectSound,
  playTimeoutSound,
  playTurnSound,
  playWrongSound,
} from '../lib/sound';
import { useSoundStore } from '../store/sound';
import type { RoomState } from '../types';

export type SoundEvent = 'turn' | 'correct' | 'wrong' | 'timeout';

export interface SoundCue {
  key: string;
  event: SoundEvent;
}

/**
 * Detecta transiciones de estado que deben producir un sonido.
 * Es una función pura para poder probarla sin navegador.
 */
export function detectSoundEvents(prev: RoomState | null, next: RoomState): SoundCue[] {
  if (!prev) return [];

  const cues: SoundCue[] = [];
  const game = next.game;

  if (!game || game.status !== 'playing') return cues;

  if (game.mode === 'race') {
    const roundChanged =
      prev.game?.phase !== 'question' || prev.game?.currentRound !== game.currentRound;

    if (game.phase === 'question' && roundChanged) {
      cues.push({
        key: `race:${game.id}:${game.currentRound}`,
        event: 'turn',
      });
    }
  } else if (game.phase === 'question' && next.question) {
    const turnChanged =
      prev.game?.phase !== 'question' ||
      prev.question?.gameQuestionId !== next.question.gameQuestionId ||
      prev.game?.currentPlayerId !== game.currentPlayerId;

    if (turnChanged) {
      cues.push({
        key: `turn:${game.id}:${next.question.gameQuestionId}:${game.currentPlayerId}`,
        event: 'turn',
      });
    }
  }

  if (game.phase === 'reveal') {
    if (game.mode === 'race' && next.race?.timedOut) {
      const timedOutNow =
        prev.game?.phase !== 'reveal' ||
        prev.game?.currentRound !== game.currentRound ||
        !prev.race?.timedOut;

      if (timedOutNow) {
        cues.push({
          key: `timeout:${game.id}:${game.currentRound}`,
          event: 'timeout',
        });
      }
    } else if (next.lastAnswer) {
      const answeredAt = next.lastAnswer.answeredAt;
      const resultChanged =
        prev.game?.phase !== 'reveal' || prev.lastAnswer?.answeredAt !== answeredAt;

      if (resultChanged) {
        if (next.lastAnswer.skipped) {
          cues.push({
            key: `timeout:${game.id}:${answeredAt}`,
            event: 'timeout',
          });
        } else {
          cues.push({
            key: `result:${game.id}:${answeredAt}:${next.lastAnswer.isCorrect}`,
            event: next.lastAnswer.isCorrect ? 'correct' : 'wrong',
          });
        }
      }
    }
  }

  return cues;
}

function playCue(event: SoundEvent): void {
  if (event === 'turn') playTurnSound();
  else if (event === 'correct') playCorrectSound();
  else if (event === 'wrong') playWrongSound();
  else playTimeoutSound();
}

export function useGameSounds(state: RoomState | null) {
  const previous = useRef<RoomState | null>(null);
  const played = useRef<Set<string>>(new Set());
  const muted = useSoundStore((store) => store.muted);

  useEffect(() => {
    if (!state) {
      previous.current = null;
      return;
    }

    // No sonar en la primera carga o al reconectar a mitad de una fase.
    if (!previous.current) {
      previous.current = state;
      return;
    }

    const cues = detectSoundEvents(previous.current, state);
    previous.current = state;

    if (muted) return;

    for (const cue of cues) {
      if (played.current.has(cue.key)) continue;
      played.current.add(cue.key);

      if (played.current.size > 140) {
        played.current.clear();
        played.current.add(cue.key);
      }

      playCue(cue.event);
    }
  }, [state, muted]);
}
