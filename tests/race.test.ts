import { describe, expect, it } from 'vitest';
import { racePointsFor, RACE_MIN_CORRECT_POINTS, RACE_TIMEOUT_PENALTY } from '../src/lib/race';

describe('puntos decrecientes de Relámpago', () => {
  it('da el máximo al responder de inmediato', () => {
    expect(racePointsFor('easy', 20)).toBe(100);
    expect(racePointsFor('medium', 20)).toBe(150);
    expect(racePointsFor('hard', 20)).toBe(200);
  });

  it('reduce los puntos con el tiempo', () => {
    expect(racePointsFor('easy', 10)).toBe(50);
    expect(racePointsFor('medium', 10)).toBe(75);
    expect(racePointsFor('hard', 10)).toBe(100);
  });

  it('mantiene un mínimo de 10', () => {
    expect(racePointsFor('easy', 0)).toBe(RACE_MIN_CORRECT_POINTS);
    expect(racePointsFor('easy', -3)).toBe(RACE_MIN_CORRECT_POINTS);
    expect(racePointsFor('hard', 0)).toBe(RACE_MIN_CORRECT_POINTS);
  });

  it('limita el máximo a 20 segundos', () => {
    expect(racePointsFor('hard', 99)).toBe(200);
  });

  it('define la penalización de timeout', () => {
    expect(RACE_TIMEOUT_PENALTY).toBe(10);
  });
});
