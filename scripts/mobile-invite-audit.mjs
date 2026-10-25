#!/usr/bin/env node
/**
 * Auditoría mobile del modal de invitación.
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
const nameA = `Inv${stamp}A`;
const nameB = `Inv${stamp}B`;
const errors = [];

async function register(page, nickname) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByText(`Hola, ${nickname}`, { exact: false }).waitFor({ timeout: 15000 });
}

async function snapshot(page, label, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  console.log(`${label} @${width}: doc=${metrics.doc} body=${metrics.body}`);
  if (Math.max(metrics.doc, metrics.body) > metrics.viewport + 1) process.exitCode = 1;
  await page.screenshot({
    path: path.join(OUT, `${label}-${width}-viewport.png`),
    fullPage: false,
  });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
pageA.on('pageerror', (error) => errors.push(`[A] ${error.message}`));
pageB.on('pageerror', (error) => errors.push(`[B] ${error.message}`));

try {
  await register(pageA, nameA);
  await register(pageB, nameB);

  await pageA.getByRole('button', { name: 'Crear sala' }).click();
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  const code = pageA.url().split('/').pop();

  const card = pageA.locator('div.rounded-xl').filter({ hasText: nameB }).first();
  await card.waitFor({ timeout: 20000 });
  await card.getByRole('button', { name: 'Invitar' }).click();

  await pageB.getByText(`${nameA} te invita`, { exact: false }).waitFor({ timeout: 15000 });
  await snapshot(pageB, '13-invite-modal', 390);
  await snapshot(pageB, '13-invite-modal', 320);

  await pageB.getByRole('button', { name: 'Entrar' }).click();
  await pageB.waitForURL(new RegExp(`/room/${code}$`), { timeout: 15000 });
  await pageB.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });

  console.log(`\nJugadores de invitación: ${nameA}, ${nameB}`);
  if (errors.length) {
    console.log('Errores de navegador:');
    for (const error of errors) console.log(' -', error);
  } else {
    console.log('Sin errores de navegador.');
  }
} catch (error) {
  console.error('Auditoría de invitación falló:', error.message);
  await pageB.screenshot({ path: path.join(OUT, 'invite-failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
