#!/usr/bin/env node
/**
 * Valida un archivo de correcciones de contexto.
 * Uso: node scripts/validate-context-fixes.mjs --file data/questions/fixes-general.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE_FILE = path.join(ROOT, 'data', 'questions.json');
const args = process.argv.slice(2);
const index = args.indexOf('--file');
const file = index >= 0 ? args[index + 1] : null;

if (!file) {
  console.error('Falta --file.');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
const byId = new Map(base.map((q) => [q.id, q]));

function norm(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const DEICTIC =
  /\b(este|esta|esto|estos|estas|dicho|dicha|dichos|dichas|mencionado|mencionada|mencionados|mencionadas)\b/i;

let fixes;
try {
  fixes = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
} catch (err) {
  console.error(`JSON inválido: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(fixes)) {
  console.error('La raíz debe ser un array.');
  process.exit(1);
}

const errors = [];
const warnings = [];
const seen = new Set();
const prompts = new Map(base.map((q) => [norm(q.question), q.id]));

for (let i = 0; i < fixes.length; i += 1) {
  const fix = fixes[i];
  const id = fix?.id;
  const original = byId.get(id);
  if (!original) {
    errors.push(`[${i}] ${id}: el ID no existe en el banco actual.`);
    continue;
  }
  if (seen.has(id)) errors.push(`[${i}] ${id}: corrección duplicada en el archivo.`);
  seen.add(id);

  if (typeof fix.question !== 'string') {
    errors.push(`[${i}] ${id}: falta question.`);
    continue;
  }
  const text = fix.question.trim();
  if (text.length < 15) errors.push(`[${i}] ${id}: pregunta demasiado corta.`);
  if (!text.endsWith('?')) errors.push(`[${i}] ${id}: debe terminar en "?".`);
  if (DEICTIC.test(text)) errors.push(`[${i}] ${id}: sigue teniendo referencia deíctica.`);
  if (/todas las anteriores|ninguna de las anteriores/i.test(text)) {
    errors.push(`[${i}] ${id}: no se permiten opciones todas/ninguna.`);
  }
  if (text.includes('<script') || text.includes('<div') || text.includes('<span')) {
    errors.push(`[${i}] ${id}: contiene HTML.`);
  }

  const normalized = norm(text);
  const duplicate = prompts.get(normalized);
  if (duplicate && duplicate !== id) {
    errors.push(`[${i}] ${id}: duplica el enunciado de ${duplicate}.`);
  }

  if (typeof fix.reason !== 'string' || fix.reason.trim().length < 5) {
    warnings.push(`[${i}] ${id}: falta una razón clara del cambio.`);
  }

  const correct = String(original.options?.[original.correctIndex] ?? '');
  if (correct.length >= 4) {
    const correctNorm = norm(correct);
    if (correctNorm && normalized.includes(correctNorm)) {
      errors.push(`[${i}] ${id}: el nuevo enunciado contiene la respuesta correcta.`);
    }
  }

  if (norm(original.question) === normalized) {
    warnings.push(`[${i}] ${id}: el enunciado no cambió.`);
  }
}

if (warnings.length) {
  console.log('\nAdvertencias:');
  for (const warning of warnings) console.log(`  ${warning}`);
}

if (errors.length) {
  console.log('\nErrores:');
  for (const error of errors) console.log(`  ${error}`);
  console.log(`\n${errors.length} error(es).`);
  process.exit(1);
}

console.log(`\n${fixes.length} correcciones válidas; 0 errores.`);
