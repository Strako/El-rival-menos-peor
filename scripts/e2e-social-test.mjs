#!/usr/bin/env node
/**
 * E2E social: timer, banderas, emojis, invitación y chat efímero.
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
const nameA = `Soc${stamp}A`;
const nameB = `Soc${stamp}B`;
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

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const contextA = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const contextB = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
track(pageA, 'A');
track(pageB, 'B');

try {
  console.log('Registrando jugadores…');
  await register(pageA, nameA);
  await register(pageB, nameB);

  console.log('Creando sala de 1 ronda…');
  const minus = pageA.getByRole('button', { name: 'Menos turnos' });
  for (let i = 0; i < 4; i++) await minus.click();
  await pageA.getByRole('button', { name: 'Crear sala' }).click();
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}$/, { timeout: 15000 });
  await pageA.getByRole('heading', { name: 'Comparte el código' }).waitFor({ timeout: 15000 });
  const code = pageA.url().split('/').pop();
  console.log('Sala:', code);

  console.log('Verificando panel de conectados…');
  await pageA.getByRole('heading', { name: 'Conectados' }).waitFor({ timeout: 15000 });
  await pageA.getByText(nameB, { exact: false }).first().waitFor({ timeout: 20000 });

  console.log('Invitando a B…');
  await pageA.getByRole('button', { name: 'Invitar' }).first().click();
  await pageB.getByText('Invitación a sala', { exact: false }).first().waitFor({ timeout: 20000 });
  await pageB.screenshot({ path: path.join(ARTIFACTS, 'invite-modal.png') });
  await pageB.getByRole('button', { name: 'Entrar' }).click();
  await pageB.waitForURL(new RegExp(`/room/${code}$`), { timeout: 15000 });

  console.log('Iniciando partida…');
  await pageA.getByRole('button', { name: 'Iniciar partida' }).click();
  await pageA.locator('.option-btn').first().waitFor({ timeout: 20000 });
  await pageB.locator('.option-btn').first().waitFor({ timeout: 20000 });

  console.log('Verificando timer, banderas y emoji de ranking…');
  await pageA.getByText(/⏱/).first().waitFor({ timeout: 10000 });
  await pageA.getByText('🥇', { exact: false }).first().waitFor({ timeout: 10000 });
  const flags = await pageA.locator('img[alt^="Bandera de"]').count();
  console.log('Banderas visibles:', flags);
  if (flags === 0) throw new Error('No se encontraron banderas');
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'game-timer-chat.png') });

  console.log('Enviando mensaje de chat…');
  const chatInput = pageA.getByLabel('Mensaje de chat');
  await chatInput.waitFor({ timeout: 10000 });
  await chatInput.fill('Hola desde el chat efímero');
  await chatInput.press('Enter');
  await pageB.getByText('Hola desde el chat efímero', { exact: false }).waitFor({ timeout: 15000 });

  console.log('Esperando timeout de 10 s…');
  const timeoutShown =
    (await pageA
      .getByText('Tiempo agotado', { exact: false })
      .waitFor({ timeout: 16000 })
      .then(() => true)
      .catch(() => false)) ||
    (await pageA
      .getByText('Turno saltado', { exact: false })
      .waitFor({ timeout: 2000 })
      .then(() => true)
      .catch(() => false));
  if (!timeoutShown) throw new Error('No apareció el mensaje de tiempo agotado');
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'timer-timeout.png') });

  console.log('\nE2E social OK');
} catch (error) {
  failed.value = true;
  console.error('\nE2E social falló:', error.message);
  await pageA.screenshot({ path: path.join(ARTIFACTS, 'social-failure-a.png') }).catch(() => {});
  await pageB.screenshot({ path: path.join(ARTIFACTS, 'social-failure-b.png') }).catch(() => {});
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
