import { describe, expect, it } from 'vitest';
import { rankBadge } from '../src/lib/rank';

describe('emojis de posición', () => {
  it('usa medallas para el podio', () => {
    expect(rankBadge(1).emoji).toBe('🥇');
    expect(rankBadge(2).emoji).toBe('🥈');
    expect(rankBadge(3).emoji).toBe('🥉');
  });

  it('usa keycaps del 4 al 10', () => {
    expect(rankBadge(4).emoji).toBe('4️⃣');
    expect(rankBadge(9).emoji).toBe('9️⃣');
    expect(rankBadge(10).emoji).toBe('🔟');
  });

  it('usa número para posiciones superiores', () => {
    expect(rankBadge(11).emoji).toBe('#11');
    expect(rankBadge(25).emoji).toBe('#25');
  });

  it('incluye etiqueta accesible', () => {
    expect(rankBadge(1).label).toBe('Puesto 1');
    expect(rankBadge(11).label).toBe('Puesto 11');
  });
});
