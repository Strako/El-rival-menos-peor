import { useEffect, useMemo, useState } from 'react';
import type { ItemEffectView, QuestionView } from '../types';

export interface DisplayOption {
  text: string;
  canonical: number;
}

function shuffleOptions(options: DisplayOption[]): DisplayOption[] {
  const next = [...options];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function useShuffledOptions(
  question: QuestionView | null,
  effects: ItemEffectView[],
  active: boolean,
) {
  const optionKey = question?.gameQuestionId ?? '';
  const orderKey = question?.optionOrder?.join(',') ?? '';
  const textKey = question?.options?.join('|') ?? '';

  const base = useMemo<DisplayOption[]>(() => {
    if (!question) return [];
    return question.options.map((text, index) => ({
      text,
      canonical: question.optionOrder?.[index] ?? index,
    }));
  }, [optionKey, orderKey, textKey]);

  const [display, setDisplay] = useState<DisplayOption[]>(base);
  const [shuffleTick, setShuffleTick] = useState(0);

  const shuffleEffect = effects.find(
    (effect) =>
      effect.itemType === 2 &&
      (!effect.expiresAt || new Date(effect.expiresAt).getTime() > Date.now()),
  );

  useEffect(() => {
    setDisplay(base);
    setShuffleTick(0);
  }, [base]);

  useEffect(() => {
    if (!active || !shuffleEffect) {
      setDisplay(base);
      return;
    }

    const timer = window.setInterval(() => {
      setDisplay((current) => shuffleOptions(current));
      setShuffleTick((current) => current + 1);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [active, base, shuffleEffect?.id, question?.gameQuestionId]);

  return { display, shuffleTick, shuffleActive: Boolean(active && shuffleEffect) };
}
