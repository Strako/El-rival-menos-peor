#!/usr/bin/env node
/**
 * Auditoría visual mobile: captura pantallas clave y detecta desbordes.
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

if (!CHROME) throw new Error('No se encontró Chrome/Edge. Define CHROME_PATH.');
fs.mkdirSync(OUT, { recursive: true });

const stamp = Date.now().toString(36).slice(-4);
const nameA = `Mob${stamp}LongName`;
const nameB = `Mob${stamp}LongNameB`;
const nameC = `Mob${stamp}C`;
const issues = [];
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
  await page.evaluate(() => window.scrollTo(0, 0));
  const metrics = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.position === 'fixed' || style.pointerEvents === 'none') return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
          const parentStyle = getComputedStyle(parent);
          if (['auto', 'scroll'].includes(parentStyle.overflowX)) return false;
          parent = parent.parentElement;
        }
        return rect.right > viewport + 1 || rect.left < -1;
      })
      .slice(0, 15)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: String(element.className ?? '').slice(0, 100),
          text: (element.textContent ?? '').trim().slice(0, 60),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      });
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      offenders,
    };
  });
  const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth) - metrics.viewport;
  if (overflow > 1) issues.push(`${label} (${width}px): overflow horizontal ${overflow}px`);
  if (metrics.offenders.length) {
    issues.push(`${label} (${width}px): ${metrics.offenders.length} elementos fuera del viewport`);
  }
  console.log(
    `${label} @${width}: doc=${metrics.documentWidth} body=${metrics.bodyWidth}` +
      (metrics.offenders.length ? ` offenders=${JSON.stringify(metrics.offenders)}` : ''),
  );
  await page.screenshot({ path: path.join(OUT, `${label}-${width}.png`), fullPage: true });
}

async function viewportShot(page, label, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, `${label}-${width}-viewport.png`), fullPage: false });
}

async function createRoom(page, mode) {
  if (mode === 'race') {
    await page.getByRole('button', { name: 'Relámpago' }).click();
  }
  const minus = page.getByRole('button', { name: mode === 'race' ? 'Menos preguntas' : 'Menos turnos' });
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

async function waitForResults(page, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.getByText('Partida finalizada', { exact: false }).count()) return;
    await page.waitForTimeout(400);
  }
  throw new Error('Timeout esperando resultados');
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const contextC = await browser.newContext({ viewport: { width: 390, height: 844 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const pageC = await contextC.newPage();

for (const [page, label] of [
  [pageA, 'A'],
  [pageB, 'B'],
  [pageC, 'C'],
]) {
  page.on('pageerror', (error) => errors.push(`[${label}] ${error.message}`));
}

try {
  await pageA.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await snapshot(pageA, '01-landing', 390);
  await snapshot(pageA, '01-landing', 360);
  await snapshot(pageA, '01-landing', 320);

  await register(pageA, nameA);
  await snapshot(pageA, '02-home', 390);
  await snapshot(pageA, '02-home', 320);

  const code1 = await createRoom(pageA, 'classic');
  await snapshot(pageA, '03-lobby-host', 390);
  await snapshot(pageA, '03-lobby-host', 360);
  await snapshot(pageA, '03-lobby-host', 320);

  await pageA.locator('header button').first().click();
  await pageA.waitForURL('**/home', { timeout: 15000 });
  await pageA.getByText('Sala reciente', { exact: false }).waitFor({ timeout: 10000 });
  await snapshot(pageA, '03b-home-active-room', 320);
  await pageA.getByRole('button', { name: 'Volver a la sala' }).click();
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await pageA.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });

  await register(pageB, nameB);
  await pageB.goto(`${BASE}/room/${code1}`, { waitUntil: 'domcontentloaded' });
  await pageB.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  await snapshot(pageB, '04-lobby-guest', 390);

  await pageA.getByRole('button', { name: 'Iniciar partida' }).click();
  await pageA.locator('.option-btn').first().waitFor({ timeout: 20000 });
  await snapshot(pageA, '05-question-host', 390);
  await viewportShot(pageA, '05-question-host', 390);
  await snapshot(pageA, '05-question-host', 360);
  await snapshot(pageA, '05-question-host', 320);
  await viewportShot(pageA, '05-question-host', 320);

  await answerOne(pageA);
  await pageA.waitForTimeout(1200);
  await snapshot(pageA, '06-reveal-host', 390);

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await pageA.getByText('Partida finalizada', { exact: false }).count()) break;
    await answerOne(pageA);
    await answerOne(pageB);
    await pageA.waitForTimeout(500);
  }
  await waitForResults(pageA);
  await snapshot(pageA, '07-results-host', 390);
  await viewportShot(pageA, '07-results-host', 390);
  await snapshot(pageA, '07-results-host', 360);
  await snapshot(pageA, '07-results-host', 320);

  await pageA.getByRole('button', { name: 'Cerrar sala' }).click();
  await pageA.getByRole('heading', { name: '¿Cerrar la sala?' }).waitFor({ timeout: 5000 });
  await snapshot(pageA, '08-close-modal', 390);
  await snapshot(pageA, '08-close-modal', 320);
  await pageA.getByRole('dialog').getByRole('button', { name: 'Cerrar sala' }).click();
  await pageA.waitForURL('**/home', { timeout: 15000 });

  const code2 = await createRoom(pageA, 'race');
  await pageB.goto(`${BASE}/room/${code2}`, { waitUntil: 'domcontentloaded' });
  await pageB.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  await pageA.getByRole('button', { name: 'Iniciar partida' }).click();
  await pageA.locator('.option-btn').first().waitFor({ timeout: 20000 });
  await snapshot(pageA, '09-race-host', 390);
  await viewportShot(pageA, '09-race-host', 390);
  await snapshot(pageA, '09-race-host', 360);
  await snapshot(pageA, '09-race-host', 320);
  await viewportShot(pageA, '09-race-host', 320);

  await pageA.getByRole('button', { name: 'Salir', exact: true }).click();
  await pageA.getByRole('heading', { name: '¿Salir de la sala?' }).waitFor({ timeout: 5000 });
  await snapshot(pageA, '10-leave-modal', 390);
  await snapshot(pageA, '10-leave-modal', 320);

  console.log(`\nJugadores mobile: ${nameA}, ${nameB}`);
  console.log(`Capturas: ${OUT}`);
  if (issues.length) {
    console.log('\nPosibles problemas:');
    for (const issue of issues) console.log(' -', issue);
    process.exitCode = 1;
  } else {
    console.log('\nSin desbordes horizontales detectados.');
  }
  if (errors.length) {
    console.log('\nErrores de navegador:');
    for (const error of errors) console.log(' -', error);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Auditoría mobile falló:', error.message);
  await pageA.screenshot({ path: path.join(OUT, 'failure-a.png'), fullPage: true }).catch(() => {});
  await pageB.screenshot({ path: path.join(OUT, 'failure-b.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
