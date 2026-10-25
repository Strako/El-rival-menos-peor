import type { ItemLogView } from '../types';

export interface ItemMeta {
  emoji: string;
  name: string;
  description: string;
  targetRequired: boolean;
}

export const ITEM_META: Record<number, ItemMeta> = {
  1: {
    emoji: '🌑',
    name: 'Apagón',
    description: 'La pantalla de la víctima parpadea en negro durante 5 segundos.',
    targetRequired: true,
  },
  2: {
    emoji: '🔀',
    name: 'Ora ora ora',
    description: 'Las respuestas de la víctima se barajan cada 1,5 segundos.',
    targetRequired: true,
  },
  3: {
    emoji: '❓',
    name: 'Ah que dijeron',
    description: 'Si la víctima no responde a los 4 s, la pregunta cambia sin reiniciar el tiempo.',
    targetRequired: true,
  },
  4: {
    emoji: '🔄',
    name: 'Ay wey',
    description: 'Intercambia puntos con un jugador activo al azar.',
    targetRequired: false,
  },
  5: {
    emoji: '🎲',
    name: 'Aleatorio',
    description: 'Víctima y efecto del 1 al 4 al azar. 5 % de +300 puntos.',
    targetRequired: false,
  },
};

export function itemMeta(type: number): ItemMeta {
  return ITEM_META[type] ?? ITEM_META[5];
}

export function itemEventMessage(event: ItemLogView, meId: string | null): string | null {
  const meta = itemMeta(event.itemType);
  const target = event.targetNickname ?? 'un jugador';
  const owner = event.ownerNickname;
  const bonus = event.metadata?.bonus300 ? ' ¡+300 puntos!' : '';
  const label =
    event.metadata?.originalItem === 5 ? `Aleatorio → ${meta.name}` : meta.name;

  if (event.status === 'held') {
    return event.ownerPlayerId === meId ? `${meta.emoji} Obtuviste ${meta.name}.` : null;
  }

  if (event.status === 'pending') {
    return `${meta.emoji} ${owner} usó ${label} contra ${target}.${bonus}`;
  }

  if (event.status === 'active') {
    return `${meta.emoji} ${label} está activo en ${target}.${bonus}`;
  }

  if (event.status === 'consumed') {
    if (event.itemType === 4) {
      return `${meta.emoji} ${owner} usó Ay wey contra ${target}.${bonus}`;
    }
    return `${meta.emoji} ${label} se aplicó a ${target}.${bonus}`;
  }

  if (event.status === 'expired') {
    return `${meta.emoji} ${label} de ${owner} expiró.`;
  }

  return null;
}
