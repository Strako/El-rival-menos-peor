#!/usr/bin/env node
/**
 * E2E del sistema de ítems: configuración, inventario y uso en Relámpago.
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
if (!CHROME) throw new Error('No se encontró Chrome/Edge.');

const stamp = Date.now().toString(36).slice(-4);
const nameA = `Its${stamp}A`;
const nameB = `Its${stamp}B`;
const errors = [];

function track(page, label) {
  page.on('pageerror', (error) => errors.push(`[${label}] ${error.message}`));
}

async function register(page, nickname) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByText(`Hola, ${nickname}`, { exact: false }).waitFor({ timeout: 15000 });
}

async function itemButton(page) {
  return page
    .locator('button')
    .filter({ hasText: /Apagón|Ora ora ora|Ah que dijeron|Ay wey|Aleatorio/ })
    .first();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contextA = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const contextB = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
track(pageA, 'A');
track(pageB, 'B');

try {
  await register(pageA, nameA);
  await register(pageB, nameB);

  console.log('Creando sala Relámpago con ítems...');
  await pageA.getByRole('button', { name: 'Relámpago' }).click();
  await pageA.getByLabel('Habilitar items').check();
  await pageA.getByLabel('Habilitar items múltiples').check();
  const minus = pageA.getByRole('button', { name: 'Menos preguntas' });
  for (let i = 0; i < 4; i += 1) await minus.click();
  await pageA.getByRole('button', { name: 'Crear sala' }).click();
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await pageA.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  const code = pageA.url().split('/').pop();
  if (!(await pageA.getByLabel('Habilitar items múltiples').isChecked())) {
    throw new Error('La configuración de ítems múltiples no se mantuvo');
  }

  await pageB.goto(`${BASE}/room/${code}`, { waitUntil: 'domcontentloaded' });
  await pageB.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });

  await pageA.getByRole('button', { name: 'Iniciar partida' }).click();
  await pageA.locator('.option-btn').first().waitFor({ timeout: 20000 });

  const buttonA = await itemButton(pageA);
  const buttonB = await itemButton(pageB);
  const holder = (await buttonA.count()) > 0 ? pageA : (await buttonB.count()) > 0 ? pageB : null;
  if (!holder) throw new Error('Ningún jugador recibió el ítem aleatorio de Relámpago');
  console.log(`Ítem recibido por ${holder === pageA ? nameA : nameB}`);

  const item = await itemButton(holder);
  const label = await item.getAttribute('title');
  await item.click();
  const dialog = holder.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });
  const targetButton = dialog.getByRole('button').filter({ hasText: holder === pageA ? nameB : nameA }).first();
  if ((await targetButton.count()) > 0) {
    await targetButton.click();
  }
  await dialog.getByRole('button', { name: 'Usar ítem' }).click();
  await holder.getByText(/usó|está activo|se aplicó/i).first().waitFor({ timeout: 15000 });
  console.log(`Ítem usado correctamente (${label ?? 'sin título'}).`);

  console.log(`\nJugadores E2E de ítems: ${nameA}, ${nameB}`);
  if (errors.length) {
    console.log('Errores de navegador:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('Sin errores de navegador.');
  }
} catch (error) {
  console.error('E2E de ítems falló:', error.message);
  await pageA.screenshot({ path: path.join(ROOT, 'e2e-artifacts', 'items-failure-a.png') }).catch(() => {});
  await pageB.screenshot({ path: path.join(ROOT, 'e2e-artifacts', 'items-failure-b.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
