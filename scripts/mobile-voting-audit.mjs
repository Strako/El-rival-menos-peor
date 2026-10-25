#!/usr/bin/env node
/**
 * Auditoría mobile de votación y resultado de votación.
 * Requiere el frontend en http://127.0.0.1:5173.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:5173';
const OUT = path.join(ROOT, 'e2e-artifacts', 'mobile');
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((candidate) => fs.existsSync(candidate));
if (!CHROME) throw new Error('No se encontró Chrome/Edge.');
fs.mkdirSync(OUT, { recursive: true });

const stamp = Date.now().toString(36).slice(-4);
const names = [`Vot${stamp}A`, `Vot${stamp}B`, `Vot${stamp}C`];
const errors = [];

async function register(page, nickname) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByText(`Hola, ${nickname}`, { exact: false }).waitFor({ timeout: 15000 });
}

async function createRoom(page) {
  await page.getByRole('button', { name: 'Eliminación' }).click();
  const minus = page.getByRole('button', { name: 'Menos turnos' });
  for (let i = 0; i < 4; i += 1) await minus.click();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await page.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  return page.url().split('/').pop();
}

async function answerOne(page) {
  const option = page.locator('.option-btn:not([disabled])').first();
  if (await option.count()) {
    await option.click();
    return true;
  }
  return false;
}

async function snapshot(page, label, width, viewport = false) {
  await page.setViewportSize({ width, height: 844 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  console.log(
    `${label} @${width}: doc=${metrics.doc} body=${metrics.body}${viewport ? ' viewport' : ''}`,
  );
  if (Math.max(metrics.doc, metrics.body) > metrics.viewport + 1) process.exitCode = 1;
  await page.screenshot({
    path: path.join(OUT, `${label}-${width}${viewport ? '-viewport' : ''}.png`),
    fullPage: !viewport,
  });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contexts = await Promise.all(
  names.map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
);
const pages = await Promise.all(contexts.map((context) => context.newPage()));
for (let i = 0; i < pages.length; i += 1) {
  pages[i].on('pageerror', (error) => errors.push(`[${i}] ${error.message}`));
}

try {
  for (let i = 0; i < pages.length; i += 1) await register(pages[i], names[i]);
  const code = await createRoom(pages[0]);
  for (let i = 1; i < pages.length; i += 1) {
    await pages[i].goto(`${BASE}/room/${code}`, { waitUntil: 'domcontentloaded' });
    await pages[i].getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  }
  await pages[0].getByRole('button', { name: 'Iniciar partida' }).click();
  await pages[0].locator('.option-btn').first().waitFor({ timeout: 20000 });

  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if (await pages[0].getByText('Votación secreta', { exact: false }).count()) break;
    if (await pages[0].getByText('Resultado de la votación', { exact: false }).count()) break;
    for (const page of pages) await answerOne(page);
    await pages[0].waitForTimeout(400);
  }

  await pages[0].getByText('Votación secreta', { exact: false }).waitFor({ timeout: 15000 });
  await snapshot(pages[0], '11-voting', 390);
  await snapshot(pages[0], '11-voting', 390, true);
  await snapshot(pages[0], '11-voting', 320);
  await snapshot(pages[0], '11-voting', 320, true);

  for (const page of pages) {
    const candidate = page.locator('button').filter({ hasText: 'Jugador activo' }).first();
    if (await candidate.count()) {
      await candidate.click();
      await page.getByRole('button', { name: 'Confirmar voto' }).click();
      await page.waitForTimeout(500);
    }
  }

  await pages[0]
    .getByText('Resultado de la votación', { exact: false })
    .waitFor({ timeout: 15000 });
  await snapshot(pages[0], '12-vote-result', 390);
  await snapshot(pages[0], '12-vote-result', 320);

  console.log(`\nJugadores de votación: ${names.join(', ')}`);
  if (errors.length) {
    console.log('Errores de navegador:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('Sin errores de navegador.');
  }
} catch (error) {
  console.error('Auditoría de votación falló:', error.message);
  await pages[0].screenshot({ path: path.join(OUT, 'voting-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
