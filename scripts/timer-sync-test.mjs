#!/usr/bin/env node
/**
 * Mide el tiempo visible al comenzar cada turno en Clásico.
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
if (!CHROME) throw new Error('No se encontró Chrome/Edge.');

const stamp = Date.now().toString(36).slice(-4);
const names = [`Tmr${stamp}A`, `Tmr${stamp}B`];
const readings = [];
const errors = [];

async function register(page, nickname) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByText(`Hola, ${nickname}`, { exact: false }).waitFor({ timeout: 15000 });
}

async function currentPlayerPage(pages) {
  for (const page of pages) {
    if ((await page.locator('.option-btn:not([disabled])').count()) > 0) return page;
  }
  return null;
}

async function waitForCurrentPlayer(pages, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const page = await currentPlayerPage(pages);
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function readTimer(page) {
  const locator = page.locator('span').filter({ hasText: /^⏱ \d+s$/ }).first();
  if ((await locator.count()) === 0) return null;
  const text = await locator.innerText();
  const match = text.match(/(\d+)s/);
  return match ? Number(match[1]) : null;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contexts = await Promise.all(
  names.map(() => browser.newContext({ viewport: { width: 1500, height: 1000 } })),
);
const pages = await Promise.all(contexts.map((context) => context.newPage()));
for (let i = 0; i < pages.length; i += 1) {
  pages[i].on('pageerror', (error) => errors.push(`[${i}] ${error.message}`));
}

try {
  await register(pages[0], names[0]);
  await register(pages[1], names[1]);

  const minus = pages[0].getByRole('button', { name: 'Menos turnos' });
  for (let i = 0; i < 3; i += 1) await minus.click();
  await pages[0].getByRole('button', { name: 'Crear sala' }).click();
  await pages[0].waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  const code = pages[0].url().split('/').pop();
  await pages[1].goto(`${BASE}/room/${code}`, { waitUntil: 'domcontentloaded' });
  await pages[1].getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  await pages[0].getByRole('button', { name: 'Iniciar partida' }).click();

  for (let turn = 1; turn <= 4; turn += 1) {
    const current = await waitForCurrentPlayer(pages, 15000);
    if (!current) throw new Error(`No apareció el turno ${turn}`);
    const index = pages.indexOf(current);
    await current.getByText('Es tu turno', { exact: false }).waitFor({ timeout: 5000 });
    readings.push({
      turn,
      player: names[index],
      seconds: await readTimer(current),
    });
    await current.locator('.option-btn:not([disabled])').first().click();
    await current.waitForTimeout(300);
  }

  console.log(JSON.stringify(readings, null, 2));
  const bad = readings.filter((reading) => (reading.seconds ?? 0) < 19);
  if (bad.length > 0) {
    throw new Error(`Turnos con menos de 19 s: ${JSON.stringify(bad)}`);
  }
  if (errors.length) {
    throw new Error(`Errores de navegador: ${errors.join(' | ')}`);
  }
  console.log('\nTiempos sincronizados.');
} catch (error) {
  console.error('Prueba de tiempos falló:', error.message);
  process.exitCode = 1;
} finally {
  console.log(`Jugadores: ${names.join(', ')}`);
  await browser.close();
}
