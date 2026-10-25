import type { Category, Difficulty, GameMode, PlayerStatus } from '../types';

export const CATEGORY_LABEL: Record<Category, string> = {
  general: 'Cultura general',
  videogames: 'Videojuegos',
  series_90s: 'Series de los 90',
};

export const CATEGORY_ICON: Record<Category, string> = {
  general: '🌍',
  videogames: '🎮',
  series_90s: '📺',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
};

export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  easy: 100,
  medium: 150,
  hard: 200,
};

export const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Clásico',
  elimination: 'Eliminación',
  race: 'Relámpago',
};

export const MODE_DESCRIPTION: Record<GameMode, string> = {
  classic: 'Todos responden la misma cantidad de preguntas. Gana el mayor puntaje.',
  elimination: 'Después de cada ronda, votan y el más votado sale de la partida.',
  race: 'Todos responden a la vez. El primero se lleva los puntos; si falla, pierde 100. Sin eliminación.',
};

export const PLAYER_STATUS_LABEL: Partial<Record<PlayerStatus, string>> = {
  eliminated: 'Eliminado',
  left: 'Salió',
  in_room: 'En sala',
  active: 'Activo',
};

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function formatScore(score: number): string {
  return new Intl.NumberFormat('es-MX').format(score);
}

export function roomLink(code: string): string {
  return `${window.location.origin}/room/${code}`;
}
