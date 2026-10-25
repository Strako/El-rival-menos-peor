import { describe, expect, it } from 'vitest';
import { initials, plural, formatScore } from '../src/lib/format';

describe('helpers de formato', () => {
  it('genera iniciales', () => {
    expect(initials('Alex García')).toBe('AG');
    expect(initials('  jugador  ')).toBe('J');
    expect(initials('')).toBe('');
  });

  it('pluraliza', () => {
    expect(plural(1, 'jugador', 'jugadores')).toBe('jugador');
    expect(plural(2, 'jugador', 'jugadores')).toBe('jugadores');
  });

  it('formatea puntajes', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(100)).toBe('100');
  });
});
