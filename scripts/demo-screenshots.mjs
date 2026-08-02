#!/usr/bin/env node
/**
 * Walks the demonstration and photographs every step.
 *
 * The point is that the pictures cannot drift from the product: they are taken
 * from the running stand, in order, by the same path a person would click. A
 * screenshot pasted into a slide deck last week is a claim about the product;
 * this is a photograph of it.
 *
 * Usage:
 *   QADAM_E2E_BASE=https://qadam-growth-os.vercel.app node scripts/demo-screenshots.mjs
 *
 * Output: docs/qadam/demo/NN-name.png plus a manifest listing what each frame
 * shows, so a missing or blank frame is visible rather than quietly skipped.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.QADAM_E2E_BASE ?? 'http://localhost:3000';
const OUT = 'docs/qadam/demo';
const PASSWORD = 'QadamLocal!2026';

const steps = [];
let index = 0;

async function shoot(page, name, note) {
  index += 1;
  const file = `${OUT}/${String(index).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const text = ((await page.textContent('body')) ?? '').replace(/\s+/g, ' ').trim();
  steps.push({ frame: index, file, url: page.url(), note, textLength: text.length });
  // A page that renders almost nothing is the failure this script exists to
  // catch: a blank frame in a deck looks like a design choice.
  process.stdout.write(`  ${String(index).padStart(2, '0')}  ${name.padEnd(28)} ${text.length > 400 ? 'ok' : 'ПОЧТИ ПУСТО'}  ${page.url()}\n`);
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(700);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
context.setDefaultTimeout(90_000);
context.setDefaultNavigationTimeout(90_000);
const page = await context.newPage();

process.stdout.write(`\nСнимаю демонстрацию с ${BASE}\n\n`);

try {
  // 1. Что это за продукт — до всякого входа.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await shoot(page, 'landing', 'Лендинг: обещание продукта и вход в демо');

  // 2. Витрина района: модуль, который виден без регистрации.
  await page.goto(`${BASE}/nearby`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await shoot(page, 'nearby', '«Скидки рядом»: предложения района без регистрации');

  // 3. Путь гостя: страница QR-кода со стола.
  await page.goto(`${BASE}/q/tamyr-stol-demo`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await shoot(page, 'qr-loyalty', 'QR-лояльность: вступление и раздельные согласия');

  // 4. Вход владельца.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await shoot(page, 'login', 'Вход: демо-режим предлагается явно');

  const demo = page.getByRole('button', { name: /DEMO_MODE/i }).first();
  if (await demo.count()) {
    await demo.click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90_000 }).catch(() => {});
  } else {
    await page.fill('input[name=email]', 'owner@qadam.local');
    await page.fill('input[name=password]', PASSWORD);
    await page.click('form:has(input[name=password]) button[type=submit]');
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90_000 }).catch(() => {});
  }
  await settle(page);
  await shoot(page, 'today', 'Сегодня: один сигнал, объяснение и одно действие');

  for (const [path, name, note] of [
    ['/app/customers', 'customers', 'Клиентская база: сегменты и согласия'],
    ['/app/segments', 'segments', 'Сегменты: кто именно попадёт в кампанию'],
    ['/app/campaigns/studio?step=3', 'studio-offer', 'Студия: выбор механики'],
    ['/app/campaigns/studio?step=5', 'simulator', 'Симулятор и Margin Shield: три сценария и решение'],
    ['/app/campaigns/studio?step=6', 'growth-contract', 'Growth Contract: что именно будет сделано и для кого'],
    ['/app/content', 'content', 'Контент-студия: материалы на двух языках'],
    ['/app/analytics', 'impact', 'Impact Ledger: прогноз отдельно от факта'],
    ['/app/automations', 'automations', 'Автоматизации, аварийная остановка и ассистент в Telegram'],
    ['/app/loyalty', 'loyalty', 'Лояльность: программа, награды и погашения'],
    ['/app/plan', 'plan', 'Тариф и лимиты: данные, а не условия в коде'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await shoot(page, name, note);
  }

  // Telegram Mini App. Opened on a phone-sized viewport in its own context,
  // because that is the only shape a guest will ever see it in — and without a
  // signed session it must show the refusal, which is itself worth a frame.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', timezoneId: 'Asia/Almaty' });
  const phonePage = await phone.newPage();
  phonePage.setDefaultTimeout(90_000);
  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const { createHmac } = await import('node:crypto');
      const chat = process.env.QADAM_DEMO_TG_CHAT ?? '900000777';
      const fields = {
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: JSON.stringify({ id: Number(chat), first_name: 'Айбек' }),
      };
      const secret = createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
      const pairs = Object.entries(fields).map(([key, value]) => `${key}=${value}`).sort();
      const params = new URLSearchParams(fields);
      params.set('hash', createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));

      await phonePage.goto(`${BASE}/tg`, { waitUntil: 'domcontentloaded' });
      const opened = await phonePage.evaluate(async (initData) => {
        const response = await fetch('/api/tg/session', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        return response.status;
      }, params.toString());
      if (opened === 200) {
        await phonePage.goto(`${BASE}/tg/card`, { waitUntil: 'domcontentloaded' });
        await settle(phonePage);
        await shoot(phonePage, 'telegram-card', 'Telegram Mini App: карта гостя, прогресс до награды и меню');
      } else {
        process.stdout.write(`  Mini App: чат ${chat} не связан (${opened}) — кадр карты пропущен\n`);
      }
    }
    await phonePage.goto(`${BASE}/tg`, { waitUntil: 'domcontentloaded' });
    await phonePage.waitForTimeout(2500);
    await shoot(phonePage, 'telegram-entry', 'Mini App вне Telegram: отказ с объяснением, а не пустой экран');
  } finally {
    await phone.close();
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ base: BASE, capturedFrames: steps.length, steps }, null, 2), 'utf8');
const thin = steps.filter((step) => step.textLength <= 400);
process.stdout.write(`\nСнято кадров: ${steps.length}. Манифест: ${OUT}/manifest.json\n`);
if (thin.length) {
  process.stdout.write(`Почти пустые кадры (${thin.length}): ${thin.map((s) => s.file).join(', ')}\n`);
  process.exit(1);
}
