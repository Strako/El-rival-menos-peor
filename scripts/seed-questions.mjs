#!/usr/bin/env node
/**
 * Carga data/questions.json en Supabase.
 *
 * Requiere una clave secreta (service_role o secret key), NO la publishable key:
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SECRET_KEY=<secret>
 *
 * Uso:
 *   node scripts/seed-questions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const baseQuestions = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'),
);
const extraFile = path.join(ROOT, 'data', 'questions', 'general-5000.json');
const extraQuestions = fs.existsSync(extraFile)
  ? JSON.parse(fs.readFileSync(extraFile, 'utf8'))
  : [];
const questions = [...baseQuestions, ...extraQuestions];

const url = process.env.SUPABASE_URL;
const secret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secret) {
  console.error(
    'Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY).\n' +
      'La publishable key no sirve para escribir: RLS bloquea el acceso directo.',
  );
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const rows = questions.map((q) => ({
  external_id: q.id,
  category: q.category,
  difficulty: q.difficulty,
  topic: q.topic ?? null,
  question: q.question,
  options: q.options,
  correct_index: q.correctIndex,
  explanation: q.explanation,
  is_active: true,
}));

let inserted = 0;
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200);
  const { error } = await supabase
    .from('questions')
    .upsert(batch, { onConflict: 'external_id' });

  if (error) {
    console.error(`Error en el lote ${i / 200 + 1}:`, error.message);
    process.exit(1);
  }
  inserted += batch.length;
  console.log(`Cargadas ${inserted}/${rows.length}`);
}

const { count, error } = await supabase
  .from('questions')
  .select('*', { count: 'exact', head: true });

if (error) {
  console.error('No se pudo verificar el total:', error.message);
  process.exit(1);
}

console.log(`Total en la base: ${count}`);
