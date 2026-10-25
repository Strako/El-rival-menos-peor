#!/usr/bin/env node
/**
 * Combina las correcciones de contexto de las tres categorías.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILES = {
  general: path.join(ROOT, 'data', 'questions', 'fixes-general.json'),
  videogames: path.join(ROOT, 'data', 'questions', 'fixes-videojuegos.json'),
  series_90s: path.join(ROOT, 'data', 'questions', 'fixes-series.json'),
};
const OUTPUT = path.join(ROOT, 'data', 'questions', 'context-fixes.json');

const all = [];
const seen = new Set();
for (const [category, file] of Object.entries(FILES)) {
  if (!fs.existsSync(file)) {
    console.log(`Sin archivo de correcciones para ${category}.`);
    continue;
  }
  const fixes = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const fix of fixes) {
    if (!fix?.id || !fix?.question) {
      console.error(`Corrección inválida en ${file}.`);
      process.exit(1);
    }
    if (seen.has(fix.id)) {
      console.error(`Corrección duplicada para ${fix.id}.`);
      process.exit(1);
    }
    seen.add(fix.id);
    all.push({
      id: fix.id,
      question: String(fix.question).trim(),
      reason: String(fix.reason ?? '').trim(),
    });
  }
  console.log(`${category}: ${fixes.length} correcciones`);
}

fs.writeFileSync(OUTPUT, `${JSON.stringify(all, null, 2)}\n`);
console.log(`Total: ${all.length}`);
console.log(`Salida: ${path.relative(ROOT, OUTPUT)}`);
