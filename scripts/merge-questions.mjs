#!/usr/bin/env node
/**
 * Consolida las tandas en los archivos finales y genera el seed SQL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PARTS = path.join(ROOT, 'data', 'questions', 'parts');

const ORDER = [
  'general-1.json',
  'general-2.json',
  'videojuegos-1.json',
  'videojuegos-2.json',
  'series-90-1.json',
  'series-90-2.json',
];

const CATEGORY_FILES = {
  general: 'cultura-general.json',
  videogames: 'videojuegos.json',
  series_90s: 'series-90.json',
};

const all = [];
for (const name of ORDER) {
  const file = path.join(PARTS, name);
  if (!fs.existsSync(file)) {
    console.error(`Falta ${name}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  all.push(...data);
}

// Aplicar correcciones de contexto manteniendo IDs, opciones y respuesta.
const FIXES_FILE = path.join(ROOT, 'data', 'questions', 'context-fixes.json');
if (fs.existsSync(FIXES_FILE)) {
  const fixes = JSON.parse(fs.readFileSync(FIXES_FILE, 'utf8'));
  const fixMap = new Map(fixes.map((fix) => [fix.id, fix.question]));
  let applied = 0;
  for (const question of all) {
    const fixed = fixMap.get(question.id);
    if (fixed) {
      question.question = fixed;
      applied += 1;
    }
  }
  console.log(`Correcciones de contexto aplicadas: ${applied}`);
}

const ids = new Set();
const prompts = new Set();
for (const q of all) {
  if (ids.has(q.id)) {
    console.error(`ID duplicado: ${q.id}`);
    process.exit(1);
  }
  ids.add(q.id);
  const p = q.question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (prompts.has(p)) {
    console.error(`Pregunta duplicada: ${q.id} - ${q.question}`);
    process.exit(1);
  }
  prompts.add(p);
}

const categoryOrder = { general: 0, videogames: 1, series_90s: 2 };
all.sort((a, b) => {
  const c = categoryOrder[a.category] - categoryOrder[b.category];
  return c !== 0 ? c : a.id.localeCompare(b.id);
});

for (const [category, filename] of Object.entries(CATEGORY_FILES)) {
  const subset = all.filter((q) => q.category === category);
  fs.writeFileSync(
    path.join(ROOT, 'data', 'questions', filename),
    `${JSON.stringify(subset, null, 2)}\n`,
  );
  console.log(`${filename}: ${subset.length}`);
}

fs.writeFileSync(
  path.join(ROOT, 'data', 'questions.json'),
  `${JSON.stringify(all, null, 2)}\n`,
);
console.log(`data/questions.json: ${all.length}`);

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const chunks = [];
for (let i = 0; i < all.length; i += 75) {
  const batch = all.slice(i, i + 75);
  const values = batch
    .map(
      (q) =>
        `(${sqlString(q.id)}, ${sqlString(q.category)}, ${sqlString(q.difficulty)}, ` +
        `${sqlString(q.question)}, ${sqlString(JSON.stringify(q.options))}::jsonb, ` +
        `${q.correctIndex}, ${sqlString(q.explanation)})`,
    )
    .join(',\n');
  chunks.push(
    `insert into public.questions (external_id, category, difficulty, question, options, correct_index, explanation)\nvalues\n${values}\non conflict (external_id) do update set\n  category = excluded.category,\n  difficulty = excluded.difficulty,\n  question = excluded.question,\n  options = excluded.options,\n  correct_index = excluded.correct_index,\n  explanation = excluded.explanation,\n  is_active = true;`,
  );
}

const seedDir = path.join(ROOT, 'supabase', 'seed');
fs.mkdirSync(seedDir, { recursive: true });
fs.writeFileSync(
  path.join(seedDir, 'questions.sql'),
  `-- Seed generado automáticamente desde data/questions.json\n-- ${all.length} preguntas\n\nbegin;\n\n${chunks.join('\n\n')}\n\ncommit;\n`,
);
console.log(`supabase/seed/questions.sql: ${all.length} filas, ${chunks.length} bloques`);
