import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const questions = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data', 'questions.json'), 'utf8'),
) as Array<{
  id: string;
  category: string;
  difficulty: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}>;

describe('banco de preguntas', () => {
  it('contiene al menos 1000 preguntas', () => {
    expect(questions.length).toBeGreaterThanOrEqual(1000);
  });

  it('tiene 350 preguntas por categoría', () => {
    const counts = questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.category] = (acc[q.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      general: 350,
      videogames: 350,
      series_90s: 350,
    });
  });

  it('todas las preguntas tienen estructura válida', () => {
    for (const q of questions) {
      expect(q.id).toMatch(/^(cg|vg|s90)-\d{4}$/);
      expect(['general', 'videogames', 'series_90s']).toContain(q.category);
      expect(['easy', 'medium', 'hard']).toContain(q.difficulty);
      expect(q.question.length).toBeGreaterThan(5);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((option) => option.trim().toLowerCase())).size).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThanOrEqual(3);
      expect(q.explanation.length).toBeGreaterThan(5);
    }
  });

  it('no tiene IDs ni enunciados duplicados', () => {
    const ids = new Set<string>();
    const prompts = new Set<string>();
    for (const q of questions) {
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      const prompt = q.question
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      expect(prompts.has(prompt)).toBe(false);
      prompts.add(prompt);
    }
  });
});
