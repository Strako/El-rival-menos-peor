#!/usr/bin/env node
/**
 * E2E de cierre de sala y salida desde el lobby.
 * Requiere el frontend en http://127.0.0.1:5173.
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
const nameA = `Cls${stamp}A`;
const nameB = `Cls${stamp}B`;
const errors = [];
const failed = { value: false };

function track(page, label) {
  page.on('pageerror', (error) => errors.push(`[${label}] pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || text.includes('Failed to load resource')) return;
    errors.push(`[${label}] console: ${text}`);
  });
}

async function register(page, nickname) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByText(`Hola, ${nickname}`, { exact: false }).waitFor({ timeout: 15000 });
}

async function createRoom(page) {
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await page.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  return page.url().split('/').pop();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contextA = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const contextB = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
track(pageA, 'A');
track(pageB, 'B');

try {
  console.log('Registrando jugadores...');
  await register(pageA, nameA);
  await register(pageB, nameB);

  console.log('\n[1] Cerrar sala desde el lobby');
  const code1 = await createRoom(pageA);
  await pageB.goto(`${BASE}/room/${code1}`, { waitUntil: 'domcontentloaded' });
  await pageB.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  await pageA.getByRole('button', { name: 'Cerrar sala' }).waitFor({ timeout: 10000 });
  if ((await pageB.getByRole('button', { name: 'Cerrar sala' }).count()) > 0) {
    throw new Error('Un invitado no debería ver el botón Cerrar sala');
  }
  await pageB.getByRole('button', { name: 'Salir de la sala' }).waitFor({ timeout: 10000 });

  await pageA.getByRole('button', { name: 'Cerrar sala' }).click();
  await pageA.getByRole('heading', { name: '¿Cerrar la sala?' }).waitFor({ timeout: 5000 });
  await pageA
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar sala' })
    .click();
  await pageA.waitForURL('**/home', { timeout: 15000 });
  console.log('  OK el anfitrión cierra la sala y vuelve al inicio');

  await pageB.getByRole('heading', { name: 'No se pudo entrar' }).waitFor({ timeout: 15000 });
  const closedText = await pageB.locator('body').innerText();
  if (!/cerrada por el anfitrión|no existe/i.test(closedText)) {
    throw new Error('El invitado no recibió el aviso de sala cerrada');
  }
  console.log('  OK el invitado recibe el cierre');
  await pageB.getByRole('button', { name: 'Volver al inicio' }).click();
  await pageB.waitForURL('**/home', { timeout: 15000 });

  console.log('\n[2] Salir de la sala desde el lobby');
  const code2 = await createRoom(pageA);
  await pageB.goto(`${BASE}/room/${code2}`, { waitUntil: 'domcontentloaded' });
  await pageB.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  await pageB.getByRole('button', { name: 'Salir', exact: true }).click();
  await pageB.getByRole('heading', { name: '¿Salir de la sala?' }).waitFor({ timeout: 5000 });
  await pageB
    .getByRole('dialog')
    .getByRole('button', { name: 'Salir de la sala' })
    .click();
  await pageB.waitForURL('**/home', { timeout: 15000 });
  console.log('  OK el invitado sale de la sala');

  await pageA.getByRole('button', { name: 'Cerrar sala' }).click();
  await pageA
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar sala' })
    .click();
  await pageA.waitForURL('**/home', { timeout: 15000 });
  console.log('  OK el anfitrión cierra la sala vacía');

  await pageA.screenshot({ path: path.join(ARTIFACTS, 'close-room-home.png') });
  console.log('\nE2E de cierre de sala OK');
} catch (error) {
  failed.value = true;
  console.error('\nE2E de cierre de sala falló:', error.message);
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'close-room-failure-a.png') }).catch(() => {});
  await pageB.screenshot({ path: path.join(ARTIFACTS, 'close-room-failure-b.png') }).catch(() => {});
} finally {
  if (errors.length) {
    console.error('\nErrores de navegador:');
    for (const error of errors) console.error(' -', error);
  } else {
    console.log('Sin errores de navegador.');
  }
  console.log(`\nJugadores E2E: ${nameA}, ${nameB}`);
  await browser.close();
  process.exit(failed.value || errors.length > 0 ? 1 : 0);
}
