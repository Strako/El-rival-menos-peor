#!/usr/bin/env node
/**
 * Aplica las correcciones de localización de Series de los 90.
 * Mantiene IDs, dificultad y correctIndex.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXES = path.join(ROOT, 'data', 'questions', 'series-90-spanish-fixes.json');
const PARTS = [
  path.join(ROOT, 'data', 'questions', 'parts', 'series-90-1.json'),
  path.join(ROOT, 'data', 'questions', 'parts', 'series-90-2.json'),
];
const CONTEXT_FIXES = path.join(ROOT, 'data', 'questions', 'context-fixes.json');

function norm(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

if (!fs.existsSync(FIXES)) {
  console.error('Falta series-90-spanish-fixes.json');
  process.exit(1);
}

const fixes = JSON.parse(fs.readFileSync(FIXES, 'utf8'));
if (!Array.isArray(fixes)) {
  console.error('Las correcciones deben ser un array.');
  process.exit(1);
}

const parts = PARTS.map((file) => ({
  file,
  data: JSON.parse(fs.readFileSync(file, 'utf8')),
}));
const byId = new Map();
for (const part of parts) {
  for (const q of part.data) {
    if (byId.has(q.id)) throw new Error(`ID duplicado en partes: ${q.id}`);
    byId.set(q.id, q);
  }
}

const errors = [];
const seenFixIds = new Set();
const fixedPrompts = new Map();
const baseFile = path.join(ROOT, 'data', 'questions.json');
const extraFile = path.join(ROOT, 'data', 'questions', 'general-5000.json');
const funFactsFile = path.join(ROOT, 'data', 'questions', 'fun-facts-1000.json');
const allOtherPrompts = new Map();
for (const file of [baseFile, extraFile, funFactsFile]) {
  if (!fs.existsSync(file)) continue;
  for (const q of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    if (!String(q.id).startsWith('s90-')) allOtherPrompts.set(norm(q.question), q.id);
  }
}

for (const fix of fixes) {
  const original = byId.get(fix.id);
  if (!original) {
    errors.push(`${fix.id}: no existe en las partes.`);
    continue;
  }
  if (seenFixIds.has(fix.id)) errors.push(`${fix.id}: corrección duplicada.`);
  seenFixIds.add(fix.id);

  if (!Array.isArray(fix.options) || fix.options.length !== 4) {
    errors.push(`${fix.id}: opciones inválidas.`);
    continue;
  }
  if (fix.correctIndex !== original.correctIndex) {
    errors.push(`${fix.id}: correctIndex cambió de ${original.correctIndex} a ${fix.correctIndex}.`);
  }
  if (typeof fix.question !== 'string' || !fix.question.trim().endsWith('?')) {
    errors.push(`${fix.id}: pregunta inválida.`);
  }
  if (typeof fix.explanation !== 'string' || fix.explanation.trim().length < 10) {
    errors.push(`${fix.id}: explicación inválida.`);
  }
  if (new Set(fix.options.map(norm)).size !== 4) {
    errors.push(`${fix.id}: opciones repetidas.`);
  }
  if (/\b(este|esta|esto|dicho|dicha|mencionado|mencionada)\b/i.test(fix.question)) {
    errors.push(`${fix.id}: referencia deíctica.`);
  }
  const normalized = norm(fix.question);
  const duplicate = allOtherPrompts.get(normalized);
  if (duplicate) errors.push(`${fix.id}: duplica el enunciado de ${duplicate}.`);
  const duplicateFix = fixedPrompts.get(normalized);
  if (duplicateFix) errors.push(`${fix.id}: duplica la corrección de ${duplicateFix}.`);
  fixedPrompts.set(normalized, fix.id);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

for (const fix of fixes) {
  const target = byId.get(fix.id);
  target.question = fix.question.trim();
  target.options = fix.options.map((option) => String(option).trim());
  target.explanation = fix.explanation.trim();
  // correctIndex se conserva; se valida arriba.
}

for (const part of parts) {
  fs.writeFileSync(part.file, `${JSON.stringify(part.data, null, 2)}\n`);
}

if (fs.existsSync(CONTEXT_FIXES)) {
  const contextFixes = JSON.parse(fs.readFileSync(CONTEXT_FIXES, 'utf8'));
  let updated = 0;
  for (const fix of contextFixes) {
    const replacement = fixes.find((item) => item.id === fix.id);
    if (replacement) {
      fix.question = replacement.question.trim();
      fix.reason = 'Localización al español de nombres de series/personajes.';
      updated += 1;
    }
  }
  fs.writeFileSync(CONTEXT_FIXES, `${JSON.stringify(contextFixes, null, 2)}\n`);
  console.log(`Context fixes actualizados: ${updated}`);
}

console.log(`Correcciones aplicadas: ${fixes.length}`);
console.log('Siguiente paso: npm run merge:questions');
