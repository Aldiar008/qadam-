import assert from 'node:assert/strict';
import test from 'node:test';

import { CAMPAIGN_SCHEMA_VERSION, parseCampaignProposal, parseGuestReply, type CampaignGenerationInput } from '../../ai/contract.ts';
import { parseGeneratedPack, parseSocialPack, type ContentPackInput, type SocialPackInput } from '../../ai/content-pack.ts';
import { createDemoProvider } from '../../ai/demo-provider.ts';
import { buildCampaignPrompt, buildContentPackPrompt, buildSocialPackPrompt } from '../../ai/prompt.ts';
import { generateCampaignProposal } from '../../ai/generator.ts';

/**
 * The demo provider is a provider, not a bypass: its answers go through the same
 * parsers as a model's, so a mistake here fails exactly the same way.
 */

const INPUT: CampaignGenerationInput = {
  businessType: 'Кофейня',
  brandVoice: 'Дружелюбно, на «вы»',
  city: 'Алматы',
  district: 'Бостандыкский',
  goal: 'reactivate',
  segment: { code: 'inactive_30', label: 'Спящие 30+ дней', size: 64, consentEligible: 18 },
  capacity: { quietWindow: '15:00–18:00', weekdayOnly: true },
  channel: 'telegram',
  catalog: [
    { name: 'Эспрессо', priceMinor: 700, costMinor: 210 },
    { name: 'Капучино', priceMinor: 1400, costMinor: 500 },
  ],
  averageOrderValueMinor: 3450,
  marginFloorBps: 4200,
  budgetMinor: 120_000,
  frequencyCap: 1,
  previousCampaign: 'нет',
  currency: 'KZT',
  locales: ['ru', 'kk'],
};

const instant = { delayMs: 0, sleep: async () => {} };

async function answer(request: Parameters<ReturnType<typeof createDemoProvider>['complete']>[0]) {
  const provider = createDemoProvider(instant);
  const response = await provider.complete(request, new AbortController().signal);
  return JSON.parse(response.text) as unknown;
}

test('the campaign answer validates against the real parser', async () => {
  const built = buildCampaignPrompt(INPUT);
  const parsed = parseCampaignProposal(await answer(built.request), { goal: 'reactivate', locales: ['ru', 'kk'] });
  assert.equal(parsed.schemaVersion, CAMPAIGN_SCHEMA_VERSION);
  assert.ok(parsed.mechanics.length >= 2);
  // The blocked variant has to be there: without it the demonstration cannot
  // show Margin Shield refusing anything.
  assert.ok(parsed.mechanics.some((m) => m.kind === 'percentage_discount'));
});

test('the campaign answer is about this venue, not a generic one', async () => {
  const built = buildCampaignPrompt(INPUT);
  const parsed = parseCampaignProposal(await answer(built.request), { goal: 'reactivate', locales: ['ru', 'kk'] });
  const gift = parsed.mechanics.find((m) => m.kind === 'gift_with_threshold');
  assert.ok(gift);
  // Cheapest catalogue item, and its cost — read back out of the prompt.
  assert.equal(gift?.benefitValue, 210);
  assert.match(gift?.copy.ru.title ?? '', /Эспрессо/);
});

const PACK: ContentPackInput = {
  businessName: 'TAMYR Coffee',
  offerRu: 'круассан в подарок при заказе от 3 500 ₸',
  offerKk: '3 500 ₸-ден бастап круассан сыйлыққа',
  briefRu: 'Вернуть спящих.',
  briefKk: 'Ұйықтағандарды қайтару.',
  channel: 'telegram',
  trackingCode: 'QDM-TEST01',
  quietWindow: '15:00–18:00',
  durationDays: 7,
};

test('the content pack answer validates and is complete in both languages', async () => {
  const built = buildContentPackPrompt({
    businessName: PACK.businessName, businessType: 'Кофейня', brandVoice: 'тёплый', bannedPhrases: [],
    offerRu: PACK.offerRu, offerKk: PACK.offerKk, briefRu: PACK.briefRu, briefKk: PACK.briefKk,
    channel: PACK.channel, trackingCode: PACK.trackingCode, quietWindow: PACK.quietWindow,
    durationDays: PACK.durationDays, catalog: ['Эспрессо', 'Капучино'],
  });
  const assets = parseGeneratedPack(await answer(built.request), PACK);
  // 1 post + 1 short + 3 stories + 1 video + 1 message, per language.
  assert.equal(assets.length, 14);
  assert.equal(assets.filter((a) => a.kind === 'story' && a.locale === 'ru').length, 3);
});

const SOCIAL: SocialPackInput = {
  businessName: 'TAMYR Coffee',
  businessType: 'Кофейня',
  city: 'Алматы',
  brandVoice: 'тёплый',
  offer: 'круассан в подарок',
  menu: [{ name: 'Эспрессо', priceMinor: 700 }, { name: 'Капучино', priceMinor: 1400 }],
  reward: 'Круассан за 5 штампов',
  quietWindow: '15:00–18:00',
  locales: ['ru', 'kk'],
};

test('the social pack answer carries a ready-to-paste prompt for a video model', async () => {
  const built = buildSocialPackPrompt(SOCIAL);
  const assets = parseSocialPack(await answer(built.request), SOCIAL);
  assert.equal(assets.length, 10);
  const reel = assets.find((a) => a.kind === 'reel_script' && a.locale === 'ru');
  assert.match(reel?.body ?? '', /Kling|Higgsfield/);
  const photo = assets.find((a) => a.kind === 'photo_brief' && a.locale === 'ru');
  assert.match(photo?.body ?? '', /Nano Banana|Midjourney/);
});

test('a guest reply quotes only the venue own figures', async () => {
  const request = {
    purpose: 'guest_reply' as const,
    schemaVersion: 'guest-reply.v1',
    promptVersion: 'guest-reply-prompt.v1',
    system: '',
    user: `<venue_facts>${JSON.stringify({ venue: 'TAMYR', menu: [{ name: 'Капучино', priceMinor: 1400 }], rewards: [{ name: 'Круассан' }], guest: { stamps: 3 } })}</venue_facts>\n<guest_question>сколько стоит капучино</guest_question>`,
    maxOutputTokens: 900,
    temperature: 0.3,
  };
  const parsed = parseGuestReply(await answer(request), new Set(['1400', '3']));
  // `toLocaleString('ru-RU')` groups with a narrow no-break space, so the
  // assertion strips whitespace rather than guessing which space it used.
  assert.match(parsed.reply.replace(/\s/g, ''), /1400/);
  assert.equal(parsed.needsHuman, false);
});

test('a question the facts do not cover is handed to a person', async () => {
  const request = {
    purpose: 'guest_reply' as const,
    schemaVersion: 'guest-reply.v1',
    promptVersion: 'guest-reply-prompt.v1',
    system: '',
    user: `<venue_facts>${JSON.stringify({ venue: 'TAMYR', menu: [] })}</venue_facts>\n<guest_question>вы делаете доставку в Астану</guest_question>`,
    maxOutputTokens: 900,
    temperature: 0.3,
  };
  const parsed = parseGuestReply(await answer(request), new Set());
  assert.equal(parsed.needsHuman, true);
});

test('the pause is abortable, so a timeout still means a timeout', async () => {
  const provider = createDemoProvider({ delayMs: 5_000 });
  const controller = new AbortController();
  const promise = provider.complete(
    { purpose: 'guest_reply', schemaVersion: 'v', promptVersion: 'v', system: '', user: '', maxOutputTokens: 10, temperature: 0 },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(promise, /aborted/);
});

test('the demo provider still goes through the whole orchestrator', async () => {
  const result = await generateCampaignProposal(INPUT, {
    provider: createDemoProvider(instant),
    timeoutMs: 5_000,
    maxAttempts: 1,
    costCeilingMicros: 1_000_000,
  });
  assert.equal(result.source, 'provider');
  assert.equal(result.telemetry.status, 'completed');
  assert.equal(result.telemetry.model, 'qadam-demo-answers-v1');
});
