import { describe, expect, it } from 'vitest';
import {
  formatChangelogDate,
  parseGithubCommit,
  type ChangelogCommit,
} from '../src/lib/changelog';

describe('changelog', () => {
  it('normaliza un commit de GitHub', () => {
    const commit = parseGithubCommit({
      sha: 'abcdef1234567890',
      html_url: 'https://github.com/Strako/El-rival-menos-peor/commit/abcdef1',
      commit: {
        message: 'add: sistema de items\n\nDetalle del cambio',
        author: {
          name: 'Strako',
          date: '2026-10-25T18:00:00Z',
        },
      },
    });

    expect(commit).toEqual<ChangelogCommit>({
      sha: 'abcdef1234567890',
      shortSha: 'abcdef1',
      title: 'add: sistema de items',
      author: 'Strako',
      date: '2026-10-25T18:00:00Z',
      url: 'https://github.com/Strako/El-rival-menos-peor/commit/abcdef1',
    });
  });

  it('descarta entradas incompletas', () => {
    expect(parseGithubCommit(null)).toBeNull();
    expect(parseGithubCommit({ sha: '', commit: { message: 'x' } })).toBeNull();
    expect(
      parseGithubCommit({
        sha: 'abc',
        html_url: 'https://github.com/x',
        commit: { message: '   ' },
      }),
    ).toBeNull();
  });

  it('formatea fechas válidas e inválidas', () => {
    expect(formatChangelogDate('2026-10-25T18:00:00Z')).toContain('2026');
    expect(formatChangelogDate('')).toBe('Fecha desconocida');
    expect(formatChangelogDate('no-es-fecha')).toBe('Fecha desconocida');
  });
});
