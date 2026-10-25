#!/usr/bin/env node
/**
 * Valida el banco de preguntas.
 *
 * Uso:
 *   node scripts/validate-questions.mjs
 *   node scripts/validate-questions.mjs data/questions/parts/general-1.json
 *   node scripts/validate-questions.mjs --final
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'data', 'questions', 'parts');
const FINAL_FILES = [
  path.join(ROOT, 'data', 'questions', 'cultura-general.json'),
  path.join(ROOT, 'data', 'questions', 'videojuegos.json'),
  path.join(ROOT, 'data', 'questions', 'series-90.json'),
];

const args = process.argv.slice(2);
const finalMode = args.includes('--final');
const fileArgs = args.filter((a) => !a.startsWith('--'));

const CATEGORIES = new Set(['general', 'videogames', 'series_90s']);
const CATEGORY_LABEL = {
  general: 'Cultura general',
  videogames: 'Videojuegos',
  series_90s: 'Series de los 90',
};
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const PREFIX = { general: 'cg', videogames: 'vg', series_90s: 's90' };
const ID_RE = /^(cg|vg|s90)-\d{4}$/;

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
  for (const t of A) if (B.has(t)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}

function loadFiles() {
  if (fileArgs.length > 0) {
    return fileArgs.map((f) => path.resolve(process.cwd(), f));
  }
  const files = [];
  if (fs.existsSync(PARTS_DIR)) {
    for (const name of fs.readdirSync(PARTS_DIR).sort()) {
      if (name.endsWith('.json')) files.push(path.join(PARTS_DIR, name));
    }
  }
  for (const f of FINAL_FILES) if (fs.existsSync(f)) files.push(f);
  return files;
}

const errors = [];
const warnings = [];
const allQuestions = [];
const byCategory = {};
const byDifficulty = {};
const byCorrectIndex = { 0: 0, 1: 0, 2: 0, 3: 0 };
const fileSummaries = [];

function addError(file, index, id, message) {
  errors.push({ file: path.relative(ROOT, file), index, id, message });
}
function addWarning(file, index, id, message) {
  warnings.push({ file: path.relative(ROOT, file), index, id, message });
}

const files = loadFiles();
if (files.length === 0) {
  console.error('No se encontraron archivos de preguntas.');
  process.exit(1);
}

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (!fs.existsSync(file)) {
    addError(file, -1, null, 'El archivo no existe.');
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    addError(file, -1, null, `JSON inválido: ${err.message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    addError(file, -1, null, 'La raíz del JSON debe ser un array.');
    continue;
  }

  const isPart = path.resolve(file).startsWith(path.resolve(PARTS_DIR));
  if (isPart && !finalMode && data.length !== 175) {
    addError(file, -1, null, `La tanda debe tener 175 preguntas; tiene ${data.length}.`);
  }

  const seenIds = new Set();
  const seenPrompts = new Set();
  const fileCats = {};
  const fileDiff = { easy: 0, medium: 0, hard: 0 };
  const fileIndex = { 0: 0, 1: 0, 2: 0, 3: 0 };

  data.forEach((q, i) => {
    const where = `${rel}[${i}]`;
    const id = q && typeof q.id === 'string' ? q.id : null;

    if (!q || typeof q !== 'object' || Array.isArray(q)) {
      addError(file, i, id, 'La pregunta debe ser un objeto.');
      return;
    }

    if (!id || !ID_RE.test(id)) {
      addError(file, i, id, 'ID inválido. Formato esperado: cg-0001, vg-0001 o s90-0001.');
    } else if (seenIds.has(id)) {
      addError(file, i, id, 'ID duplicado en el archivo.');
    } else {
      seenIds.add(id);
    }

    if (!CATEGORIES.has(q.category)) {
      addError(file, i, id, `Categoría inválida: ${JSON.stringify(q.category)}.`);
    } else if (id && !id.startsWith(`${PREFIX[q.category]}-`)) {
      addError(file, i, id, `El ID no coincide con la categoría ${q.category}.`);
    }

    if (!DIFFICULTIES.has(q.difficulty)) {
      addError(file, i, id, `Dificultad inválida: ${JSON.stringify(q.difficulty)}.`);
    }

    if (typeof q.question !== 'string' || q.question.trim().length === 0) {
      addError(file, i, id, 'Falta el enunciado.');
    } else {
      const text = q.question.trim();
      if (text.length < 10 && !/^\d+\s*\?\s*$/.test(text)) {
        addError(file, i, id, 'El enunciado es demasiado corto.');
      } else if (text.length > 260) {
        addWarning(file, i, id, `Enunciado largo (${text.length} caracteres).`);
      }
      if (!text.endsWith('?') && !text.endsWith(':')) {
        addWarning(file, i, id, 'El enunciado no termina en "?" ni ":".');
      }
      const n = norm(text);
      if (n.includes('todas las anteriores') || n.includes('ninguna de las anteriores')) {
        addError(file, i, id, 'No se permiten opciones del tipo "todas/ninguna de las anteriores".');
      }
      if (seenPrompts.has(n)) {
        addError(file, i, id, 'Enunciado duplicado (normalizado) dentro del archivo.');
      } else {
        seenPrompts.add(n);
      }
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      addError(file, i, id, 'Debe haber exactamente 4 opciones.');
    } else {
      const normalized = new Set();
      q.options.forEach((opt, oi) => {
        if (typeof opt !== 'string' || opt.trim().length === 0) {
          addError(file, i, id, `La opción ${oi} está vacía o no es texto.`);
          return;
        }
        if (opt !== opt.trim()) {
          addWarning(file, i, id, `La opción ${oi} tiene espacios al inicio/fin.`);
        }
        if (opt.length > 120) {
          addWarning(file, i, id, `La opción ${oi} es muy larga.`);
        }
        const n = norm(opt);
        if (n.includes('todas las anteriores') || n.includes('ninguna de las anteriores')) {
          addError(file, i, id, 'No se permiten opciones del tipo "todas/ninguna de las anteriores".');
        }
        if (normalized.has(n)) {
          addError(file, i, id, `Opciones duplicadas: "${opt}".`);
        }
        normalized.add(n);
      });
    }

    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
      addError(file, i, id, 'correctIndex debe ser un entero entre 0 y 3.');
    } else if (Array.isArray(q.options) && q.options.length === 4) {
      fileIndex[q.correctIndex] += 1;
      byCorrectIndex[q.correctIndex] += 1;
    }

    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 10) {
      addError(file, i, id, 'Falta la explicación o es demasiado corta.');
    } else if (q.explanation.length > 320) {
      addWarning(file, i, id, `Explicación larga (${q.explanation.length} caracteres).`);
    }

    if (typeof q.question === 'string') {
      const lower = q.question.toLowerCase();
      if (lower.includes('<script') || lower.includes('<div') || lower.includes('<span')) {
        addError(file, i, id, 'El enunciado no debe contener HTML.');
      }
    }

    if (CATEGORIES.has(q.category)) {
      byCategory[q.category] = (byCategory[q.category] || 0) + 1;
      fileCats[q.category] = (fileCats[q.category] || 0) + 1;
    }
    if (DIFFICULTIES.has(q.difficulty)) {
      byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
      fileDiff[q.difficulty] += 1;
    }

    allQuestions.push({ q, file, i });
  });

  fileSummaries.push({
    file: rel,
    count: data.length,
    categories: fileCats,
    difficulties: fileDiff,
    correctIndex: fileIndex,
  });
}

// Duplicados globales de ID y enunciado.
const idMap = new Map();
const promptMap = new Map();
for (const item of allQuestions) {
  const { q, file, i } = item;
  if (q && typeof q.id === 'string') {
    if (idMap.has(q.id)) {
      addError(file, i, q.id, `ID duplicado también en ${path.relative(ROOT, idMap.get(q.id).file)}.`);
    } else {
      idMap.set(q.id, item);
    }
  }
  if (q && typeof q.question === 'string') {
    const n = norm(q.question);
    if (promptMap.has(n)) {
      const prev = promptMap.get(n);
      addError(file, i, q.id, `Enunciado duplicado también en ${path.relative(ROOT, prev.file)}[${prev.i}] (${prev.q.id}).`);
    } else {
      promptMap.set(n, item);
    }
  }
}

// Duplicados cercanos (solo advertencia).
if (fileArgs.length === 0 && allQuestions.length <= 1300) {
  for (let a = 0; a < allQuestions.length; a++) {
    for (let b = a + 1; b < allQuestions.length; b++) {
      const qa = allQuestions[a].q;
      const qb = allQuestions[b].q;
      if (!qa?.question || !qb?.question || qa.category !== qb.category) continue;
      if (jaccard(qa.question, qb.question) >= 0.9) {
        addWarning(allQuestions[b].file, allQuestions[b].i, qb.id, `Muy similar a ${qa.id}: "${qa.question}"`);
      }
    }
  }
}

const total = allQuestions.length;
for (const [cat, count] of Object.entries(byCategory)) {
  if (finalMode && count < 350) {
    addError(path.join(ROOT, 'data'), -1, null, `La categoría ${cat} tiene ${count}; se requieren al menos 350.`);
  }
}
if (finalMode && total < 1050) {
  addError(path.join(ROOT, 'data'), -1, null, `Total ${total}; se requieren al menos 1050 preguntas.`);
}

console.log('\n=== Resumen por archivo ===');
for (const s of fileSummaries) {
  console.log(`\n${s.file}`);
  console.log(`  Preguntas: ${s.count}`);
  console.log(`  Categorías: ${JSON.stringify(s.categories)}`);
  console.log(`  Dificultad: ${JSON.stringify(s.difficulties)}`);
  console.log(`  Respuesta correcta por índice: ${JSON.stringify(s.correctIndex)}`);
}

console.log('\n=== Totales globales ===');
console.log(`  Preguntas: ${total}`);
console.log(`  Por categoría: ${JSON.stringify(byCategory)}`);
console.log(`  Por dificultad: ${JSON.stringify(byDifficulty)}`);
console.log(`  Por índice correcto: ${JSON.stringify(byCorrectIndex)}`);

for (const [idx, count] of Object.entries(byCorrectIndex)) {
  if (total > 0 && count / total > 0.4) {
    addWarning(path.join(ROOT, 'data'), -1, null, `El índice ${idx} concentra el ${Math.round((count / total) * 100)}% de las respuestas.`);
  }
}

if (warnings.length > 0) {
  console.log(`\n=== Advertencias (${warnings.length}) ===`);
  for (const w of warnings.slice(0, 40)) {
    console.log(`  ${w.file}[${w.index}] ${w.id ?? ''}: ${w.message}`);
  }
  if (warnings.length > 40) console.log(`  ... y ${warnings.length - 40} más.`);
}

if (errors.length > 0) {
  console.log(`\n=== Errores (${errors.length}) ===`);
  for (const e of errors.slice(0, 80)) {
    console.log(`  ${e.file}[${e.index}] ${e.id ?? ''}: ${e.message}`);
  }
  if (errors.length > 80) console.log(`  ... y ${errors.length - 80} más.`);
} else {
  console.log('\n0 errores.');
}

if (fileArgs.length === 0 || finalMode) {
  const report = {
    generatedAt: new Date().toISOString(),
    files: fileSummaries,
    totals: {
      questions: total,
      byCategory,
      byDifficulty,
      byCorrectIndex,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
  };
  fs.writeFileSync(path.join(ROOT, 'data', 'questions.report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReporte: data/questions.report.json`);
}

process.exit(errors.length > 0 ? 1 : 0);
