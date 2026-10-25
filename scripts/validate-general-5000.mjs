#!/usr/bin/env node
/**
 * Valida el banco ampliado de cultura general.
 *
 * Uso:
 *   node scripts/validate-general-5000.mjs --file data/questions/general-5000/gen-001.json
 *   node scripts/validate-general-5000.mjs --final
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NEW_DIR = path.join(ROOT, 'data', 'questions', 'general-5000');
const BASE_FILE = path.join(ROOT, 'data', 'questions.json');
const REPORT_FILE = path.join(ROOT, 'data', 'questions', 'general-5000.report.json');

const args = process.argv.slice(2);
const finalMode = args.includes('--final');
const fileIndex = args.indexOf('--file');
const singleFile = fileIndex >= 0 ? args[fileIndex + 1] : null;

const CATEGORY = 'general';
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const ID_RE = /^cg-\d{4}$/;
const DEICTIC =
  /\b(este|esta|esto|estos|estas|dicho|dicha|dichos|dichas|mencionado|mencionada|mencionados|mencionadas)\b/i;
const GENERIC =
  /\b(el|la)\s+(pais|país|ciudad|rio|río|obra|autor|personaje|consola|serie|pelicula|película|libro)\b/i;
const SUPERLATIVE =
  /\b(el|la)\s+(mas|más|mejor|peor|primero|primera|mayor|menor)\b/i;

const errors = [];
const warnings = [];
const fileSummaries = [];
const all = [];

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

function addError(file, index, id, message) {
  errors.push({ file: path.relative(ROOT, file), index, id, message });
}
function addWarning(file, index, id, message) {
  warnings.push({ file: path.relative(ROOT, file), index, id, message });
}

let base = [];
if (fs.existsSync(BASE_FILE)) {
  base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
}

const basePrompts = new Map();
for (const q of base) {
  if (q?.question) basePrompts.set(norm(q.question), q.id);
}

function listFiles() {
  if (singleFile) return [path.resolve(process.cwd(), singleFile)];
  if (!fs.existsSync(NEW_DIR)) return [];
  return fs
    .readdirSync(NEW_DIR)
    .filter((name) => /^gen-\d{3}\.json$/.test(name))
    .sort()
    .map((name) => path.join(NEW_DIR, name));
}

const files = listFiles();
if (files.length === 0) {
  console.error('No se encontraron archivos gen-*.json.');
  process.exit(1);
}

for (const file of files) {
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
    addError(file, -1, null, 'La raíz debe ser un array.');
    continue;
  }
  if (data.length !== 260) {
    addError(file, -1, null, `Debe tener 260 preguntas; tiene ${data.length}.`);
  }

  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const byIndex = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const byTopic = {};
  const seenIds = new Set();
  const seenPrompts = new Map();

  data.forEach((q, index) => {
    const id = q && typeof q.id === 'string' ? q.id : null;

    if (!q || typeof q !== 'object' || Array.isArray(q)) {
      addError(file, index, id, 'La pregunta debe ser un objeto.');
      return;
    }

    if (!id || !ID_RE.test(id)) {
      addError(file, index, id, 'ID inválido. Formato esperado: cg-####.');
    } else {
      const number = Number(id.slice(3));
      if (number < 1001 || number > 6200) {
        addError(file, index, id, 'El ID debe estar entre cg-1001 y cg-6200.');
      }
      if (seenIds.has(id)) addError(file, index, id, 'ID duplicado en el archivo.');
      seenIds.add(id);
    }

    if (q.category !== CATEGORY) {
      addError(file, index, id, `Categoría inválida: ${q.category}.`);
    }
    if (!DIFFICULTIES.has(q.difficulty)) {
      addError(file, index, id, `Dificultad inválida: ${q.difficulty}.`);
    } else {
      byDifficulty[q.difficulty] += 1;
    }

    if (typeof q.topic !== 'string' || q.topic.trim().length < 3) {
      addWarning(file, index, id, 'Falta el topic o es demasiado corto.');
    } else {
      byTopic[q.topic] = (byTopic[q.topic] ?? 0) + 1;
    }

    if (typeof q.question !== 'string' || q.question.trim().length === 0) {
      addError(file, index, id, 'Falta el enunciado.');
    } else {
      const text = q.question.trim();
      if (text.length < 15) addError(file, index, id, 'Enunciado demasiado corto.');
      if (text.length > 300) addWarning(file, index, id, 'Enunciado demasiado largo.');
      if (!text.endsWith('?')) addError(file, index, id, 'El enunciado debe terminar en "?".');
      if (DEICTIC.test(text)) {
        addError(file, index, id, 'Referencia ambigua: usa “este/esta/dicho/mencionado”.');
      }
      if (GENERIC.test(text)) {
        addWarning(file, index, id, 'Referencia genérica (“el país/la obra/el autor…”). Añade contexto.');
      }
      if (SUPERLATIVE.test(text)) {
        addWarning(file, index, id, 'Superlativo o “el primero” sin alcance claro.');
      }
      const n = norm(text);
      if (basePrompts.has(n)) {
        addError(file, index, id, `Duplicada de la pregunta existente ${basePrompts.get(n)}.`);
      }
      if (seenPrompts.has(n)) {
        addError(file, index, id, `Enunciado duplicado en el archivo (${seenPrompts.get(n)}).`);
      } else {
        seenPrompts.set(n, id);
      }
      if (text.includes('<script') || text.includes('<div') || text.includes('<span')) {
        addError(file, index, id, 'El enunciado no debe contener HTML.');
      }
      if (/todas las anteriores|ninguna de las anteriores/i.test(text)) {
        addError(file, index, id, 'No se permiten opciones del tipo todas/ninguna.');
      }
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      addError(file, index, id, 'Debe haber exactamente 4 opciones.');
    } else {
      const normalized = new Set();
      q.options.forEach((option, optionIndex) => {
        if (typeof option !== 'string' || option.trim().length === 0) {
          addError(file, index, id, `La opción ${optionIndex} está vacía.`);
          return;
        }
        if (option.length > 120) addWarning(file, index, id, `Opción ${optionIndex} muy larga.`);
        if (option !== option.trim()) addWarning(file, index, id, `Opción ${optionIndex} con espacios.`);
        if (/todas las anteriores|ninguna de las anteriores/i.test(option)) {
          addError(file, index, id, 'No se permiten opciones todas/ninguna.');
        }
        const n = norm(option);
        if (normalized.has(n)) addError(file, index, id, `Opciones repetidas: "${option}".`);
        normalized.add(n);
      });
    }

    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
      addError(file, index, id, 'correctIndex debe ser un entero entre 0 y 3.');
    } else {
      byIndex[q.correctIndex] += 1;
    }

    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 15) {
      addError(file, index, id, 'Falta la explicación o es demasiado corta.');
    } else if (q.explanation.length > 420) {
      addWarning(file, index, id, 'Explicación demasiado larga.');
    }

    all.push({ q, file, index });
  });

  if (byDifficulty.easy !== 104 || byDifficulty.medium !== 104 || byDifficulty.hard !== 52) {
    addError(
      file,
      -1,
      null,
      `Distribución de dificultad incorrecta: ${JSON.stringify(byDifficulty)}. Debe ser 104/104/52.`,
    );
  }

  const maxIndex = Math.max(...Object.values(byIndex));
  if (data.length > 0 && maxIndex / data.length > 0.4) {
    addWarning(file, -1, null, `Un índice concentra ${Math.round((maxIndex / data.length) * 100)}% de las respuestas.`);
  }

  // Duplicados cercanos dentro del archivo.
  for (let i = 0; i < data.length; i += 1) {
    for (let j = i + 1; j < data.length; j += 1) {
      if (!data[i]?.question || !data[j]?.question) continue;
      if (jaccard(data[i].question, data[j].question) >= 0.92) {
        addWarning(file, j, data[j].id, `Muy similar a ${data[i].id}.`);
      }
    }
  }

  fileSummaries.push({
    file: path.relative(ROOT, file),
    count: data.length,
    difficulties: byDifficulty,
    correctIndex: byIndex,
    topics: byTopic,
  });
}

// Duplicados globales entre archivos.
if (!singleFile) {
  const ids = new Map();
  const prompts = new Map();
  for (const item of all) {
    if (item.q?.id) {
      if (ids.has(item.q.id)) {
        addError(item.file, item.index, item.q.id, `ID duplicado también en ${path.relative(ROOT, ids.get(item.q.id).file)}.`);
      } else {
        ids.set(item.q.id, item);
      }
    }
    if (item.q?.question) {
      const n = norm(item.q.question);
      if (prompts.has(n)) {
        addWarning(
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

const total = all.length;
const byCategory = { general: all.filter((x) => x.q?.category === 'general').length };
const byDifficulty = { easy: 0, medium: 0, hard: 0 };
const byIndex = { 0: 0, 1: 0, 2: 0, 3: 0 };
const byTopic = {};
for (const { q } of all) {
  if (DIFFICULTIES.has(q?.difficulty)) byDifficulty[q.difficulty] += 1;
  if (Number.isInteger(q?.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3) {
    byIndex[q.correctIndex] += 1;
  }
  if (typeof q?.topic === 'string') byTopic[q.topic] = (byTopic[q.topic] ?? 0) + 1;
}

if (finalMode && total !== 5200) {
  addError(path.join(ROOT, 'data'), -1, null, `El banco candidato debe tener 5200; tiene ${total}.`);
}

console.log('\n=== Resumen por archivo ===');
for (const summary of fileSummaries) {
  console.log(`\n${summary.file}`);
  console.log(`  Preguntas: ${summary.count}`);
  console.log(`  Dificultad: ${JSON.stringify(summary.difficulties)}`);
  console.log(`  CorrectIndex: ${JSON.stringify(summary.correctIndex)}`);
  console.log(`  Topics: ${JSON.stringify(summary.topics)}`);
}

console.log('\n=== Totales ===');
console.log(`  Preguntas: ${total}`);
console.log(`  Por categoría: ${JSON.stringify(byCategory)}`);
console.log(`  Por dificultad: ${JSON.stringify(byDifficulty)}`);
console.log(`  Por índice correcto: ${JSON.stringify(byIndex)}`);

if (warnings.length) {
  console.log(`\n=== Advertencias (${warnings.length}) ===`);
  for (const warning of warnings.slice(0, 50)) {
    console.log(`  ${warning.file}[${warning.index}] ${warning.id ?? ''}: ${warning.message}`);
  }
  if (warnings.length > 50) console.log(`  ... y ${warnings.length - 50} más.`);
}

if (errors.length) {
  console.log(`\n=== Errores (${errors.length}) ===`);
  for (const error of errors.slice(0, 80)) {
    console.log(`  ${error.file}[${error.index}] ${error.id ?? ''}: ${error.message}`);
  }
  if (errors.length > 80) console.log(`  ... y ${errors.length - 80} más.`);
} else {
  console.log('\n0 errores.');
}

if (!singleFile || finalMode) {
  const report = {
    generatedAt: new Date().toISOString(),
    files: fileSummaries,
    totals: {
      questions: total,
      byCategory,
      byDifficulty,
      byIndex,
      byTopic,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
  };
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReporte: ${path.relative(ROOT, REPORT_FILE)}`);
}

process.exit(errors.length > 0 ? 1 : 0);
