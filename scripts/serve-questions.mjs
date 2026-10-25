#!/usr/bin/env node
/**
 * Servidor local para que el agente de carga lea el banco completo
 * sin volcar miles de preguntas en el contexto.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE_FILE = path.join(ROOT, 'data', 'questions.json');
const EXTRA_FILE = path.join(ROOT, 'data', 'questions', 'general-5000.json');

function read(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const base = read(BASE_FILE);
const extra = read(EXTRA_FILE);
const all = [...base, ...extra];

const server = http.createServer((request, response) => {
  const url = request.url ?? '/';
  let data = all;
  if (url.startsWith('/base')) data = base;
  else if (url.startsWith('/new')) data = extra;

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(data));
});

server.listen(7313, '127.0.0.1', () => {
  console.log(
    `Banco servido en http://127.0.0.1:7313/all · base=${base.length} nuevas=${extra.length} total=${all.length}`,
  );
});
