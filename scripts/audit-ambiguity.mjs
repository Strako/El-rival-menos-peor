#!/usr/bin/env node
/**
 * Detecta preguntas potencialmente ambiguas en el banco actual.
 * Genera data/questions.audit-candidates.json para revisión.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'questions.json');
const OUTPUT = path.join(ROOT, 'data', 'questions.audit-candidates.json');

const DEICTIC =
  /\b(este|esta|esto|estos|estas|dicho|dicha|dichos|dichas|mencionado|mencionada|mencionados|mencionadas)\b/i;
const GENERIC =
  /\b(el|la)\s+(pais|país|ciudad|rio|río|obra|autor|personaje|consola|serie|pelicula|película|libro)\b/i;
const SUPERLATIVE =
  /\b(el|la)\s+(mas|más|mejor|peor|primero|primera|mayor|menor)\b/i;

const questions = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const candidates = [];
const counts = { deictic: 0, generic: 0, superlative: 0, who: 0, which: 0, where: 0, short: 0 };
const byCategory = {};

for (const q of questions) {
  const reasons = [];
  const text = String(q.question ?? '');

  if (DEICTIC.test(text)) {
    reasons.push('Referencia deíctica (este/esta/dicho/mencionado).');
    counts.deictic += 1;
  }
  if (GENERIC.test(text)) {
    reasons.push('Referencia genérica (el país/la obra/el autor...).');
    counts.generic += 1;
  }
  if (SUPERLATIVE.test(text)) {
    reasons.push('Superlativo o “el primero” sin alcance claro.');
    counts.superlative += 1;
  }
  if (/^¿quién\b/i.test(text)) {
    reasons.push('Empieza por “¿Quién...?”; verificar que el referente sea inequívoco.');
    counts.who += 1;
  }
  if (/^¿cuál\b/i.test(text) && !/\b(de|del|en|entre|según|para)\b/i.test(text)) {
    reasons.push('“¿Cuál...?” sin ámbito explícito.');
    counts.which += 1;
  }
  if (/^¿dónde\b/i.test(text)) {
    reasons.push('“¿Dónde...?”; verificar que el lugar sea inequívoco.');
    counts.where += 1;
  }
  if (text.length < 35) {
    reasons.push('Enunciado corto; verificar contexto.');
    counts.short += 1;
  }

  if (reasons.length > 0) {
    candidates.push({
      id: q.id,
      category: q.category,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      reasons,
    });
    byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
  }
}

fs.writeFileSync(OUTPUT, `${JSON.stringify(candidates, null, 2)}\n`);

console.log(`Preguntas totales: ${questions.length}`);
console.log(`Candidatas a revisión: ${candidates.length}`);
console.log(`Por categoría: ${JSON.stringify(byCategory)}`);
console.log(`Motivos: ${JSON.stringify(counts)}`);
console.log(`Salida: ${path.relative(ROOT, OUTPUT)}`);
