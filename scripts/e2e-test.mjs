#!/usr/bin/env node
/**
 * Prueba E2E del flujo principal con dos navegadores reales.
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

if (!CHROME) {
  throw new Error('No se encontró Chrome/Edge. Define CHROME_PATH.');
}
const ARTIFACTS = path.join(ROOT, 'e2e-artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const stamp = Date.now().toString(36).slice(-4);
const nameA = `E2E${stamp}A`;
const nameB = `E2E${stamp}B`;
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

async function waitForTurnOrResults(pageA, pageB, timeout = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (
      (await visible(pageA, 'Ganador de la sala', 300)) ||
      (await visible(pageA, 'Fin de la partida', 300)) ||
      (await visible(pageA, 'Sin ganador', 300))
    ) {
      return 'results';
    }

    if (await visible(pageA, 'Es tu turno', 300)) return 'A';
    if (await visible(pageB, 'Es tu turno', 300)) return 'B';
    await pageA.waitForTimeout(500);
  }
  throw new Error('No apareció un turno ni los resultados a tiempo');
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
  console.log('Registrando dos jugadores…');
  await register(pageA, nameA);
  await register(pageB, nameB);

  console.log('Creando sala con 1 turno…');
  const minus = pageA.getByRole('button', { name: 'Menos turnos' });
  for (let i = 0; i < 4; i++) await minus.click();
  await pageA.getByRole('button', { name: 'Crear sala' }).click();
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await pageA.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  const code = pageA.url().split('/').pop();
  console.log('Código de sala:', code);

  console.log('Uniendo al segundo jugador…');
  await pageB.getByLabel('Código de sala').fill(code);
  await pageB.getByRole('button', { name: 'Unirme' }).click();
  await pageB.waitForURL(new RegExp(`/room/${code}$`), { timeout: 15000 });
  await pageA.getByText(nameB, { exact: false }).first().waitFor({ timeout: 15000 });
  console.log('Ambos jugadores en el lobby.');

  await pageA.screenshot({ path: path.join(ARTIFACTS, 'lobby.png') });

  console.log('Iniciando partida…');
  const startButton = pageA.getByRole('button', { name: 'Iniciar partida' });
  await startButton.waitFor({ timeout: 10000 });
  await startButton.click();
  await pageA.locator('.option-btn').first().waitFor({ timeout: 20000 });
  console.log('Pregunta visible.');

  for (let turn = 1; turn <= 2; turn++) {
    const active = await waitForTurnOrResults(pageA, pageB);
    if (active === 'results') break;

    const page = active === 'A' ? pageA : pageB;
    const label = active === 'A' ? nameA : nameB;
    console.log(`Turno ${turn}: responde ${label}`);
    await page.locator('.option-btn').first().click();
    await page
      .locator('text=/Respuesta (correcta|incorrecta)|Turno saltado/')
      .first()
      .waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
  }

  console.log('Esperando resultados…');
  const resultsVisible =
    (await visible(pageA, 'Ganador de la sala', 25000)) ||
    (await visible(pageA, 'Sin ganador', 5000));
  if (!resultsVisible) throw new Error('No apareció la pantalla de resultados');

  const winnerVisible =
    (await visible(pageA, nameA, 2000)) || (await visible(pageA, nameB, 2000));
  console.log('Resultados visibles. Ganador mostrado:', winnerVisible);
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'results.png') });

  const hostCanRestart = await pageA
    .getByRole('button', { name: 'Volver a jugar' })
    .isVisible()
    .catch(() => false);
  const guestWaiting = await visible(pageB, 'Esperando al anfitrión', 3000);
  console.log('Host puede reiniciar:', hostCanRestart, '| Invitado espera:', guestWaiting);
  if (!hostCanRestart || !guestWaiting) throw new Error('Controles de reinicio incorrectos');

  console.log('Reiniciando sala desde el anfitrión…');
  await pageA.getByRole('button', { name: 'Volver a jugar' }).click();
  const dialog = pageA.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Volver a jugar' }).click();
  await pageA.getByRole('heading', { name: 'Configuración' }).waitFor({ timeout: 15000 });
  await pageB.getByRole('heading', { name: 'El anfitrión decide' }).waitFor({ timeout: 15000 });
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'lobby-restart.png') });

  console.log('\nE2E OK');
} catch (error) {
  failed = true;
  console.error('\nE2E falló:', error.message);
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'failure-a.png') }).catch(() => {});
  await pageB.screenshot({ path: path.join(ARTIFACTS, 'failure-b.png') }).catch(() => {});
} finally {
  if (errors.length) {
    console.error('\nErrores de navegador:');
    for (const error of errors) console.error(' -', error);
  } else {
    console.log('Sin errores de navegador.');
  }

  console.log(`\nJugadores E2E: ${nameA}, ${nameB}`);
  console.log(`Artefactos: ${ARTIFACTS}`);
  await browser.close();
  process.exit(failed || errors.length > 0 ? 1 : 0);
}
