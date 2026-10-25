#!/usr/bin/env node
/**
 * Verifica que la tarjeta de jugador del lobby no parta el nombre letra por letra.
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
const nickname = `Lob${stamp}`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tu nickname').fill(nickname);
  await page.getByRole('button', { name: 'Crear mi jugador' }).click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await page.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });

  let failures = 0;
  for (const width of [320, 390, 640, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const metrics = await page.evaluate((name) => {
      const nameNode = [...document.querySelectorAll('p[title]')].find(
        (node) => node.getAttribute('title') === name,
      );
      if (!nameNode) return null;
      const rect = nameNode.getBoundingClientRect();
      const style = getComputedStyle(nameNode);
      const lineHeight = Number.parseFloat(style.lineHeight) || rect.height;
      const card = nameNode.closest('div.rounded-2xl');
      const cardRect = card?.getBoundingClientRect();
      return {
        nameWidth: Math.round(rect.width),
        nameHeight: Math.round(rect.height),
        lines: Math.round(rect.height / lineHeight),
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        cardRight: cardRect ? Math.round(cardRect.right) : null,
        viewport: document.documentElement.clientWidth,
        doc: document.documentElement.scrollWidth,
      };
    }, nickname);
    const ok =
      metrics &&
      metrics.lines === 1 &&
      metrics.cardRight <= metrics.viewport + 1 &&
      metrics.doc <= metrics.viewport + 1;
    if (!ok) failures += 1;
    console.log(`${width}px: ${ok ? 'OK' : 'FALLO'} ${JSON.stringify(metrics)}`);
    if (width === 1024) {
      await page.screenshot({
        path: path.join(ROOT, 'e2e-artifacts', 'mobile', 'lobby-card-1024.png'),
        fullPage: true,
      });
    }
  }

  console.log(`\nJugador de prueba: ${nickname}`);
  if (failures > 0) {
    console.error(`${failures} viewport(s) fallaron.`);
    process.exitCode = 1;
  } else {
    console.log('Tarjeta de lobby OK en todos los anchos.');
  }
} finally {
  await browser.close();
}
