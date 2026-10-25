import { DIFFICULTY_POINTS } from './format';
import type { Difficulty } from '../types';

export const RACE_SECONDS = 10;
export const RACE_MIN_CORRECT_POINTS = 10;
export const RACE_TIMEOUT_PENALTY = 10;

/**
 * Puntos de una respuesta correcta en Relámpago.
 * Bajan linealmente con el tiempo restante, con mínimo de 10 y redondeo a 5.
 */
export function racePointsFor(difficulty: Difficulty, remainingSeconds: number): number {
  const base = DIFFICULTY_POINTS[difficulty];
  const remaining = Math.max(0, Math.min(RACE_SECONDS, remainingSeconds));
  const raw = (base * remaining) / RACE_SECONDS;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(RACE_MIN_CORRECT_POINTS, rounded);
}
