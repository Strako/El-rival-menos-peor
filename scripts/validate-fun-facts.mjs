#!/usr/bin/env node
/**
 * Valida los lotes de datos curiosos.
 *   node scripts/validate-fun-facts.mjs --file data/questions/fun-facts-1000/ff-001.json
 *   node scripts/validate-fun-facts.mjs --final
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
const REPORT = path.join(ROOT, 'data', 'questions', 'fun-facts-1000.report.json');

const args = process.argv.slice(2);
const finalMode = args.includes('--final');
const fileIndex = args.indexOf('--file');
const singleFile = fileIndex >= 0 ? args[fileIndex + 1] : null;

const ID_RE = /^cg-\d{4}$/;
const DEICTIC =
  /\b(este|esta|esto|estos|estas|dicho|dicha|dichos|dichas|mencionado|mencionada|mencionados|mencionadas)\b/i;
const GENERIC =
  /\b(el|la)\s+(pais|país|ciudad|rio|río|obra|autor|personaje|consola|serie|pelicula|película|libro)\b/i;
const SUPERLATIVE =
  /\b(el|la)\s+(mas|más|mejor|peor|primero|primera|mayor|menor)\b/i;

const errors = [];
const warnings = [];
const all = [];
const summaries = [];

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

function error(file, index, id, message) {
  errors.push({ file: path.relative(ROOT, file), index, id, message });
}
function warning(file, index, id, message) {
  warnings.push({ file: path.relative(ROOT, file), index, id, message });
}

const basePrompts = new Map();
for (const baseFile of BASE_FILES) {
  if (!fs.existsSync(baseFile)) continue;
  const rows = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  for (const q of rows) {
    if (q?.question) basePrompts.set(norm(q.question), q.id);
  }
}

function listFiles() {
  if (singleFile) return [path.resolve(process.cwd(), singleFile)];
  return fs
    .readdirSync(DIR)
    .filter((name) => /^ff-\d{3}\.json$/.test(name))
    .sort()
    .map((name) => path.join(DIR, name));
}

for (const file of listFiles()) {
  if (!fs.existsSync(file)) {
    error(file, -1, null, 'El archivo no existe.');
    continue;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    error(file, -1, null, `JSON inválido: ${err.message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    error(file, -1, null, 'La raíz debe ser un array.');
    continue;
  }
  if (data.length !== 220) {
    error(file, -1, null, `Debe tener 220 preguntas; tiene ${data.length}.`);
  }

  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const byIndex = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const seenIds = new Set();
  const seenPrompts = new Map();

  data.forEach((q, index) => {
    const id = q?.id ?? null;
    if (!q || typeof q !== 'object' || Array.isArray(q)) {
      error(file, index, id, 'La pregunta debe ser un objeto.');
      return;
    }

    if (!id || !ID_RE.test(id)) {
      error(file, index, id, 'ID inválido. Formato cg-####.');
    } else {
      const n = Number(id.slice(3));
      if (n < 6001 || n > 7100) {
        error(file, index, id, 'El ID debe estar entre cg-6001 y cg-7100.');
      }
      if (seenIds.has(id)) error(file, index, id, 'ID duplicado.');
      seenIds.add(id);
    }

    if (q.category !== 'general') error(file, index, id, 'Categoría inválida.');
    if (q.topic !== 'fun_facts') warning(file, index, id, 'Topic distinto de fun_facts.');
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
      error(file, index, id, 'Dificultad inválida.');
    } else {
      byDifficulty[q.difficulty] += 1;
    }

    if (typeof q.question !== 'string' || !q.question.trim()) {
      error(file, index, id, 'Falta el enunciado.');
    } else {
      const text = q.question.trim();
      if (text.length < 15) error(file, index, id, 'Enunciado demasiado corto.');
      if (!text.endsWith('?')) error(file, index, id, 'Debe terminar en "?".');
      if (DEICTIC.test(text)) error(file, index, id, 'Referencia deíctica.');
      if (GENERIC.test(text)) warning(file, index, id, 'Referencia genérica; añade contexto.');
      if (SUPERLATIVE.test(text)) warning(file, index, id, 'Superlativo sin alcance claro.');
      if (/<script|<div|<span/i.test(text)) error(file, index, id, 'Contiene HTML.');
      if (/todas las anteriores|ninguna de las anteriores/i.test(text)) {
        error(file, index, id, 'No se permiten opciones todas/ninguna.');
      }

      const n = norm(text);
      if (basePrompts.has(n)) {
        error(file, index, id, `Duplicada de la pregunta existente ${basePrompts.get(n)}.`);
      }
      if (seenPrompts.has(n)) {
        error(file, index, id, `Enunciado duplicado en el archivo (${seenPrompts.get(n)}).`);
      } else {
        seenPrompts.set(n, id);
      }
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      error(file, index, id, 'Debe haber exactamente 4 opciones.');
    } else {
      const optionSet = new Set();
      q.options.forEach((option, optionIndex) => {
        if (typeof option !== 'string' || !option.trim()) {
          error(file, index, id, `Opción ${optionIndex} vacía.`);
          return;
        }
        if (/todas las anteriores|ninguna de las anteriores/i.test(option)) {
          error(file, index, id, 'No se permiten opciones todas/ninguna.');
        }
        const n = norm(option);
        if (optionSet.has(n)) error(file, index, id, `Opción repetida: ${option}.`);
        optionSet.add(n);
      });
    }

    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
      error(file, index, id, 'correctIndex inválido.');
    } else {
      byIndex[q.correctIndex] += 1;
    }

    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 15) {
      error(file, index, id, 'Explicación ausente o demasiado corta.');
    }

    all.push({ q, file, index });
  });

  if (byDifficulty.easy !== 88 || byDifficulty.medium !== 88 || byDifficulty.hard !== 44) {
    error(file, -1, null, `Dificultad incorrecta: ${JSON.stringify(byDifficulty)}. Debe ser 88/88/44.`);
  }
  if (Object.values(byIndex).some((count) => count !== 55)) {
    warning(file, -1, null, `correctIndex desequilibrado: ${JSON.stringify(byIndex)}.`);
  }

  for (let i = 0; i < data.length; i += 1) {
    for (let j = i + 1; j < data.length; j += 1) {
      if (!data[i]?.question || !data[j]?.question) continue;
      if (jaccard(data[i].question, data[j].question) >= 0.92) {
        warning(file, j, data[j].id, `Muy similar a ${data[i].id}.`);
      }
    }
  }

  summaries.push({
    file: path.relative(ROOT, file),
    count: data.length,
    difficulties: byDifficulty,
    correctIndex: byIndex,
  });
}

if (!singleFile) {
  const ids = new Map();
  const prompts = new Map();
  for (const item of all) {
    if (item.q?.id) {
      if (ids.has(item.q.id)) error(item.file, item.index, item.q.id, 'ID duplicado entre archivos.');
      else ids.set(item.q.id, item);
    }
    if (item.q?.question) {
      const n = norm(item.q.question);
      if (prompts.has(n)) {
        warning(
          item.file,
          item.index,
          item.q.id,
          `Enunciado repetido entre archivos (${prompts.get(n).q.id}); el merge lo descartará.`,
        );
      } else {
        prompts.set(n, item);
      }
    }
  }
}

const totals = {
  questions: all.length,
  files: summaries.length,
  errors: errors.length,
  warnings: warnings.length,
};

console.log('\nResumen:');
for (const summary of summaries) {
  console.log(
    `${summary.file}: ${summary.count} · ${JSON.stringify(summary.difficulties)} · ${JSON.stringify(summary.correctIndex)}`,
  );
}
console.log(`\nTotal: ${all.length}`);

if (warnings.length) {
  console.log(`\nAdvertencias (${warnings.length}):`);
  for (const item of warnings.slice(0, 40)) {
    console.log(`  ${item.file}[${item.index}] ${item.id ?? ''}: ${item.message}`);
  }
  if (warnings.length > 40) console.log(`  ... y ${warnings.length - 40} más.`);
}

if (errors.length) {
  console.log(`\nErrores (${errors.length}):`);
  for (const item of errors.slice(0, 60)) {
    console.log(`  ${item.file}[${item.index}] ${item.id ?? ''}: ${item.message}`);
  }
  if (errors.length > 60) console.log(`  ... y ${errors.length - 60} más.`);
} else {
  console.log('\n0 errores.');
}

if (!singleFile || finalMode) {
  fs.writeFileSync(REPORT, `${JSON.stringify({ generatedAt: new Date().toISOString(), summaries, totals, errors, warnings }, null, 2)}\n`);
  console.log(`\nReporte: ${path.relative(ROOT, REPORT)}`);
}

process.exit(errors.length > 0 ? 1 : 0);
