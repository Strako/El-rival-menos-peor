#!/usr/bin/env node
/**
 * E2E del modo Relámpago + sonidos.
 * Requiere el dev server en http://127.0.0.1:5173.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:5173';
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((candidate) => fs.existsSync(candidate));

if (!CHROME) throw new Error('No se encontró Chrome/Edge. Define CHROME_PATH.');

const ARTIFACTS = path.join(ROOT, 'e2e-artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const stamp = Date.now().toString(36).slice(-4);
const nameA = `Race${stamp}A`;
const nameB = `Race${stamp}B`;
const errors = [];
let failed = false;

function track(page, label) {
  page.on('pageerror', (error) => errors.push(`[${label}] pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || text.includes('Failed to load resource')) return;
    errors.push(`[${label}] console: ${text}`);
  });
}

async function visible(page, text, timeout = 10000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function register(page, nickname) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').waitFor({ timeout: 15000 });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByText(`Hola, ${nickname}`, { exact: false }).waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contextA = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
track(pageA, 'A');
track(pageB, 'B');

try {
  console.log('Registrando jugadores…');
  await register(pageA, nameA);
  await register(pageB, nameB);

  console.log('Probando toggle de sonido…');
  const soundButton = pageA.getByRole('button', { name: 'Silenciar sonido' });
  await soundButton.waitFor({ timeout: 5000 });
  await soundButton.click();
  await pageA.getByRole('button', { name: 'Activar sonido' }).waitFor({ timeout: 5000 });
  await pageA.getByRole('button', { name: 'Activar sonido' }).click();
  await pageA.getByRole('button', { name: 'Silenciar sonido' }).waitFor({ timeout: 5000 });
  console.log('Toggle de sonido OK.');

  console.log('Creando sala Relámpago con 2 preguntas…');
  await pageA.getByRole('button', { name: /Relámpago/ }).click();
  const minus = pageA.getByRole('button', { name: 'Menos preguntas' });
  for (let i = 0; i < 3; i++) await minus.click();
  await pageA.getByRole('button', { name: 'Crear sala' }).click();
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await pageA.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  const code = pageA.url().split('/').pop();
  console.log('Código:', code);

  await pageB.getByLabel('Código de sala').fill(code);
  await pageB.getByRole('button', { name: 'Unirme' }).click();
  await pageB.waitForURL(new RegExp(`/room/${code}$`), { timeout: 15000 });
  await pageA.getByText(nameB, { exact: false }).first().waitFor({ timeout: 15000 });
  await pageA.getByText('10 segundos por pregunta', { exact: false }).waitFor({ timeout: 10000 });

  console.log('Iniciando partida…');
  await pageA.getByRole('button', { name: 'Iniciar partida' }).click();
  await pageA.locator('.option-btn').first().waitFor({ timeout: 20000 });
  await pageB.locator('.option-btn').first().waitFor({ timeout: 20000 });
  await pageA.getByText('todos responden a la vez', { exact: false }).waitFor({ timeout: 10000 });
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'race-question.png') });

  console.log('Ambos intentan responder primero…');
  await Promise.all([
    pageA.locator('.option-btn').first().click({ timeout: 5000 }).catch(() => {}),
    pageB.locator('.option-btn').first().click({ timeout: 5000 }).catch(() => {}),
  ]);

  const revealShown =
    (await visible(pageA, 'respondió primero', 15000)) ||
    (await visible(pageA, 'Nadie respondió', 5000));
  if (!revealShown) throw new Error('No apareció la revelación de la primera respuesta');
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'race-reveal.png') });

  console.log('Esperando ronda 2 para probar el timeout…');
  await pageA.getByText('Ronda 2 de 2', { exact: false }).waitFor({ timeout: 20000 });
  const timeoutShown =
    (await visible(pageA, 'Nadie respondió', 20000)) ||
    (await visible(pageA, 'Se acabó el tiempo', 5000));
  if (!timeoutShown) throw new Error('No apareció el estado de tiempo agotado');

  console.log('Esperando resultados…');
  const resultsShown =
    (await visible(pageA, 'Ganador de la sala', 20000)) ||
    (await visible(pageA, 'Fin de la partida', 5000));
  if (!resultsShown) throw new Error('No aparecieron los resultados');
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'race-results.png') });

  const hostRestart = await pageA
    .getByRole('button', { name: 'Volver a jugar' })
    .isVisible()
    .catch(() => false);
  const guestWaiting = await visible(pageB, 'Esperando al anfitrión', 5000);
  console.log('Host puede reiniciar:', hostRestart, '| Invitado espera:', guestWaiting);
  if (!hostRestart || !guestWaiting) throw new Error('Controles de reinicio incorrectos');

  await pageA.getByRole('button', { name: 'Volver a jugar' }).click();
  const dialog = pageA.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Volver a jugar' }).click();
  await pageA.getByRole('heading', { name: 'Configuración' }).waitFor({ timeout: 15000 });
  await pageB.getByRole('heading', { name: 'El anfitrión decide' }).waitFor({ timeout: 15000 });

  console.log('\nE2E Relámpago OK');
} catch (error) {
  failed = true;
  console.error('\nE2E Relámpago falló:', error.message);
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'race-failure-a.png') }).catch(() => {});
  await pageB.screenshot({ path: path.join(ARTIFACTS, 'race-failure-b.png') }).catch(() => {});
} finally {
  if (errors.length) {
    console.error('\nErrores de navegador:');
    for (const error of errors) console.error(' -', error);
  } else {
    console.log('Sin errores de navegador.');
  }

  console.log(`\nJugadores E2E: ${nameA}, ${nameB}`);
  await browser.close();
  process.exit(failed || errors.length > 0 ? 1 : 0);
}
