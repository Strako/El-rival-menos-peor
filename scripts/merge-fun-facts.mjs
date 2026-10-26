#!/usr/bin/env node
/**
 * Deduplica las 1.100 candidatas y selecciona 1.000 finales.
 * Reasigna IDs cg-6001 … cg-7000.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'questions', 'fun-facts-1000');
const BASE_FILES = [
  path.join(ROOT, 'data', 'questions.json'),
  path.join(ROOT, 'data', 'questions', 'general-5000.json'),
];
const OUT = path.join(ROOT, 'data', 'questions', 'fun-facts-1000.json');
const REPORT = path.join(ROOT, 'data', 'questions', 'fun-facts-1000.selected.report.json');

function norm(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(norm(value).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(items) {
  return [...items].sort((a, b) => hash(a.id) - hash(b.id));
}

const basePrompts = new Map();
for (const file of BASE_FILES) {
  if (!fs.existsSync(file)) continue;
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const q of rows) {
    if (q?.question) basePrompts.set(norm(q.question), q.id);
  }
}

const files = fs
  .readdirSync(DIR)
  .filter((name) => /^ff-\d{3}\.json$/.test(name))
  .sort();

if (files.length !== 5) {
  console.error(`Se esperaban 5 archivos; hay ${files.length}.`);
  process.exit(1);
}

const queues = [];
const seenIds = new Set();
const seenPrompts = new Map();
const removed = { base: [], exact: [], near: [] };

for (const name of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
  const queue = [];

  for (const q of data) {
    if (!q?.question || !q?.id) continue;
    if (seenIds.has(q.id)) {
      removed.exact.push({ id: q.id, reason: 'ID duplicado' });
      continue;
    }

    const n = norm(q.question);
    if (basePrompts.has(n)) {
      removed.base.push({ id: q.id, existing: basePrompts.get(n), question: q.question });
      seenIds.add(q.id);
      continue;
    }
    if (seenPrompts.has(n)) {
      removed.exact.push({ id: q.id, duplicateOf: seenPrompts.get(n), question: q.question });
      seenIds.add(q.id);
      continue;
    }

    let nearDuplicate = null;
    for (const [existingNorm, existingId] of seenPrompts) {
      if (jaccard(n, existingNorm) >= 0.95) {
        nearDuplicate = existingId;
        break;
      }
    }
    if (nearDuplicate) {
      removed.near.push({ id: q.id, duplicateOf: nearDuplicate, question: q.question });
      seenIds.add(q.id);
      continue;
    }

    seenIds.add(q.id);
    seenPrompts.set(n, q.id);
    queue.push(q);
  }

  queues.push({ name, queue: seededShuffle(queue), cursor: 0 });
}

const uniqueCount = queues.reduce((sum, item) => sum + item.queue.length, 0);
if (uniqueCount < 1000) {
  console.error(`Solo hay ${uniqueCount} únicas; se necesitan 1000.`);
  process.exit(1);
}

const selected = [];
while (selected.length < 1000) {
  let added = false;
  for (const item of queues) {
    if (selected.length >= 1000) break;
    if (item.cursor >= item.queue.length) continue;
    selected.push(item.queue[item.cursor]);
    item.cursor += 1;
    added = true;
  }
  if (!added) break;
}

const final = selected.map((q, i) => ({
  ...q,
  id: `cg-${String(6001 + i).padStart(4, '0')}`,
}));

const finalIds = new Set();
const finalPrompts = new Set();
for (const q of final) {
  if (finalIds.has(q.id)) throw new Error(`ID duplicado final: ${q.id}`);
  finalIds.add(q.id);
  const n = norm(q.question);
  if (finalPrompts.has(n)) throw new Error(`Pregunta duplicada final: ${q.question}`);
  finalPrompts.add(n);
}

fs.writeFileSync(OUT, `${JSON.stringify(final, null, 2)}\n`);

const byDifficulty = { easy: 0, medium: 0, hard: 0 };
const byIndex = { 0: 0, 1: 0, 2: 0, 3: 0 };
const byTopic = {};
for (const q of final) {
  byDifficulty[q.difficulty] += 1;
  byIndex[q.correctIndex] += 1;
  byTopic[q.topic] = (byTopic[q.topic] ?? 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  uniqueCandidates: uniqueCount,
  selected: final.length,
  removed,
  totals: { byDifficulty, byIndex, byTopic },
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Seleccionadas: ${final.length}`);
console.log(`Únicas disponibles: ${uniqueCount}`);
console.log(`Duplicadas con el banco actual: ${removed.base.length}`);
console.log(`Duplicadas entre candidatas: ${removed.exact.length}`);
console.log(`Near-duplicates descartados: ${removed.near.length}`);
console.log(`Dificultad: ${JSON.stringify(byDifficulty)}`);
console.log(`Índices: ${JSON.stringify(byIndex)}`);
console.log(`Salida: ${path.relative(ROOT, OUT)}`);
