/**
 * Bilingual content pack.
 *
 * One brief becomes a full channel set. RU and KK are written as separate
 * messages in their own register — a Kazakh reader should get a message that
 * sounds written for them, not a word-for-word rendering of the Russian.
 *
 * Automatic checks can verify structure (every asset present, both languages,
 * alt text non-empty, CTA present, length within channel limits). They cannot
 * verify that the Kazakh reads naturally, so every pack is emitted with
 * `reviewStatus: 'native_review_required'` for KK. That flag is a release gate,
 * not decoration.
 */

export type ContentKind = 'post' | 'short_post' | 'story' | 'video_script' | 'direct_message';
export type ContentLocale = 'ru' | 'kk';

export interface ContentAsset {
  kind: ContentKind;
  locale: ContentLocale;
  /** Ordinal within its kind, so three stories keep their order. */
  ordinal: number;
  body: string;
  cta: string;
  altText: string;
  channel: string;
  /** Structural checks only; language quality is a human gate. */
  reviewStatus: 'auto_checked' | 'native_review_required';
  charLimit: number;
}

export interface ContentPackInput {
  businessName: string;
  offerRu: string;
  offerKk: string;
  briefRu: string;
  briefKk: string;
  channel: string;
  /** Public tracking code printed in the copy so redemption can be attributed. */
  trackingCode: string;
  quietWindow: string;
  durationDays: number;
}

/** Per-channel practical limits; used for both generation and the preview badge. */
export const CHANNEL_LIMITS: Record<ContentKind, number> = {
  post: 1200,
  short_post: 280,
  story: 120,
  video_script: 900,
  direct_message: 700,
};

function clamp(text: string, limit: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

export function buildContentPack(input: ContentPackInput): ContentAsset[] {
  const { businessName, offerRu, offerKk, briefRu, briefKk, channel, trackingCode, quietWindow, durationDays } = input;

  const assets: ContentAsset[] = [];
  const push = (kind: ContentKind, locale: ContentLocale, ordinal: number, body: string, cta: string, altText: string) => {
    assets.push({
      kind,
      locale,
      ordinal,
      body: clamp(body, CHANNEL_LIMITS[kind]),
      cta,
      altText,
      channel,
      // Structure is machine-checkable; Kazakh phrasing is not.
      reviewStatus: locale === 'kk' ? 'native_review_required' : 'auto_checked',
      charLimit: CHANNEL_LIMITS[kind],
    });
  };

  // --- main post -----------------------------------------------------------
  push('post', 'ru', 1,
    `${businessName}. ${briefRu}\n\nЧто предлагаем: ${offerRu}. Предложение действует ${durationDays} дней и адресовано только тем, кто дал согласие на сообщения.\n\nПокажите код ${trackingCode} на кассе — так мы поймём, что вы пришли именно по этому предложению.`,
    'Забрать предложение',
    `Изображение предложения «${offerRu}» в ${businessName}`);
  push('post', 'kk', 1,
    `${businessName}. ${briefKk}\n\nҰсынысымыз: ${offerKk}. Ұсыныс ${durationDays} күн жарамды және тек хабарлама алуға келісім берген қонақтарға арналған.\n\nКассада ${trackingCode} кодын көрсетіңіз — сонда сіздің дәл осы ұсыныс бойынша келгеніңізді білеміз.`,
    'Ұсынысты алу',
    `${businessName} мекемесіндегі «${offerKk}» ұсынысының суреті`);

  // --- short post ----------------------------------------------------------
  push('short_post', 'ru', 1, `${offerRu}. Только для наших гостей, ${durationDays} дней. Код ${trackingCode}.`, 'Подробнее',
    `Короткая карточка предложения «${offerRu}»`);
  push('short_post', 'kk', 1, `${offerKk}. Тек біздің қонақтарға, ${durationDays} күн. Коды ${trackingCode}.`, 'Толығырақ',
    `«${offerKk}» ұсынысының қысқа карточкасы`);

  // --- three stories with distinct jobs: hook, offer, action ---------------
  const storiesRu: [string, string, string][] = [
    ['Давно вас не видели', 'Мы заметили, что вы к нам давно не заходили.', 'Смахните вверх'],
    ['Что мы приготовили', offerRu, 'Смотреть условия'],
    [`Успейте за ${durationDays} дней`, `Покажите код ${trackingCode} на кассе.`, 'Забрать'],
  ];
  const storiesKk: [string, string, string][] = [
    ['Сізді көптен көрмедік', 'Бізге келмегеніңізге көп болды.', 'Жоғары сырғытыңыз'],
    ['Не дайындадық', offerKk, 'Шарттарын көру'],
    [`${durationDays} күн ішінде үлгеріңіз`, `Кассада ${trackingCode} кодын көрсетіңіз.`, 'Алу'],
  ];
  storiesRu.forEach(([title, body, cta], index) => push('story', 'ru', index + 1, `${title}. ${body}`, cta, `Сторис ${index + 1}: ${title}`));
  storiesKk.forEach(([title, body, cta], index) => push('story', 'kk', index + 1, `${title}. ${body}`, cta, `Сторис ${index + 1}: ${title}`));

  // --- 15-second vertical video script ------------------------------------
  push('video_script', 'ru', 1,
    `[0–3 с] Крупный план: гость заходит в ${businessName}.\n[3–7 с] Текст на экране: «${offerRu}».\n[7–11 с] Показываем, как выглядит предложение, ${quietWindow} — самое спокойное время.\n[11–15 с] Финальный кадр: код ${trackingCode} и призыв зайти в ближайшие ${durationDays} дней.`,
    'Зайти на этой неделе',
    `Сценарий вертикального видео о предложении «${offerRu}»`);
  push('video_script', 'kk', 1,
    `[0–3 с] Ірі план: қонақ ${businessName} мекемесіне кіреді.\n[3–7 с] Экрандағы жазу: «${offerKk}».\n[7–11 с] Ұсыныстың қалай көрінетінін көрсетеміз, ${quietWindow} — ең тыныш уақыт.\n[11–15 с] Соңғы кадр: ${trackingCode} коды және алдағы ${durationDays} күнде келуге шақыру.`,
    'Осы аптада келу',
    `«${offerKk}» ұсынысы туралы тік бейне сценарийі`);

  // --- messenger message ---------------------------------------------------
  push('direct_message', 'ru', 1,
    `Здравствуйте! Это ${businessName}. ${briefRu} Для вас: ${offerRu}. Предложение личное, действует ${durationDays} дней. Назовите код ${trackingCode} на кассе. Если больше не хотите получать сообщения — ответьте «стоп».`,
    'Показать на кассе',
    `Сообщение в ${channel} с предложением «${offerRu}»`);
  push('direct_message', 'kk', 1,
    `Сәлеметсіз бе! Бұл — ${businessName}. ${briefKk} Сізге: ${offerKk}. Ұсыныс жеке, ${durationDays} күн жарамды. Кассада ${trackingCode} кодын айтыңыз. Хабарлама алғыңыз келмесе — «тоқта» деп жауап беріңіз.`,
    'Кассада көрсету',
    `${channel} арқылы «${offerKk}» ұсынысы бар хабарлама`);

  return assets;
}

export const CONTENT_SCHEMA_VERSION = 'content-pack.v1';
export const CONTENT_PROMPT_VERSION = 'content-pack-prompt.v1';

export const SOCIAL_SCHEMA_VERSION = 'social-pack.v1';
export const SOCIAL_PROMPT_VERSION = 'social-pack-prompt.v1';

/**
 * Материалы, которые владелец не станет писать сам.
 *
 * A café owner does not sit down to write a Reels script. This is the part of
 * «автоматизация» that was missing entirely: the product could plan a campaign
 * and could not produce the thing that goes on Instagram on Monday morning.
 *
 * Deliberately not sendable. These are shooting briefs and captions the owner
 * publishes by hand; the delivery pipeline only accepts direct messages, and
 * nothing here can slip into it.
 */
export type SocialKind = 'reel_script' | 'tiktok_script' | 'photo_brief' | 'story_series' | 'push_notice';

export const SOCIAL_KINDS: readonly SocialKind[] = ['reel_script', 'tiktok_script', 'photo_brief', 'story_series', 'push_notice'];

export const SOCIAL_LIMITS: Record<SocialKind, number> = {
  reel_script: 1400,
  tiktok_script: 1200,
  photo_brief: 900,
  story_series: 900,
  push_notice: 300,
};

export interface SocialAsset {
  kind: SocialKind;
  locale: ContentLocale;
  title: string;
  body: string;
  cta: string;
  /** What has to exist in the shot or the frame before this can be made. */
  needs: readonly string[];
}

export interface SocialPackInput {
  businessName: string;
  businessType: string;
  city: string;
  brandVoice: string;
  /** The offer the venue is actually running, or the loyalty programme. */
  offer: string;
  menu: readonly { name: string; priceMinor: number }[];
  reward: string | null;
  quietWindow: string;
  locales: readonly ContentLocale[];
}

export function parseSocialPack(raw: unknown, input: SocialPackInput): SocialAsset[] {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (String(body.schemaVersion ?? '') !== SOCIAL_SCHEMA_VERSION) {
    throw new ContentSchemaError(`pack.schemaVersion must be ${SOCIAL_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(body.assets)) throw new ContentSchemaError('pack.assets must be an array');

  const assets: SocialAsset[] = body.assets.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const path = `pack.assets[${index}]`;
    const kind = String(item.kind ?? '') as SocialKind;
    if (!SOCIAL_KINDS.includes(kind)) throw new ContentSchemaError(`${path}.kind must be one of ${SOCIAL_KINDS.join(', ')}`);
    const locale = String(item.locale ?? 'ru') as ContentLocale;
    if (locale !== 'ru' && locale !== 'kk') throw new ContentSchemaError(`${path}.locale must be ru or kk`);

    const text = String(item.body ?? '').trim();
    if (!text) throw new ContentSchemaError(`${path}.body must not be empty`);
    if (text.length > SOCIAL_LIMITS[kind]) throw new ContentSchemaError(`${path}.body exceeds the ${kind} limit`);

    const title = String(item.title ?? '').replace(/\s+/g, ' ').trim();
    if (!title) throw new ContentSchemaError(`${path}.title must not be empty`);

    return {
      kind, locale, title: title.slice(0, 120), body: text,
      cta: String(item.cta ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Зайти на этой неделе',
      needs: Array.isArray(item.needs)
        ? Object.freeze(item.needs.map((need) => String(need).trim().slice(0, 120)).filter(Boolean).slice(0, 5))
        : Object.freeze([]),
    };
  });

  // Every kind, in the language the owner asked for. A pack missing the Reels
  // script is the one thing they came for.
  for (const locale of input.locales) {
    for (const kind of SOCIAL_KINDS) {
      if (!assets.some((asset) => asset.kind === kind && asset.locale === locale)) {
        throw new ContentSchemaError(`pack is missing ${locale}:${kind}`);
      }
    }
  }
  return assets;
}

/** What every pack must contain, in both languages. */
export const EXPECTED_ASSETS: readonly [ContentKind, number][] = [
  ['post', 1], ['short_post', 1], ['story', 3], ['video_script', 1], ['direct_message', 1],
];

const KINDS: readonly ContentKind[] = ['post', 'short_post', 'story', 'video_script', 'direct_message'];

class ContentSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentSchemaError';
  }
}

/**
 * Turns an untrusted model answer into a pack, or refuses it.
 *
 * The same structure the deterministic template guarantees is required here:
 * every kind, both languages, non-empty CTA and alt text, within the channel
 * limit, and Kazakh that is not the Russian pasted twice. Anything short of
 * that falls back to the template rather than reaching the owner half-built.
 */
export function parseGeneratedPack(raw: unknown, input: ContentPackInput): ContentAsset[] {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (String(body.schemaVersion ?? '') !== CONTENT_SCHEMA_VERSION) {
    throw new ContentSchemaError(`pack.schemaVersion must be ${CONTENT_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(body.assets)) throw new ContentSchemaError('pack.assets must be an array');

  const assets: ContentAsset[] = body.assets.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const path = `pack.assets[${index}]`;
    const kind = String(item.kind ?? '') as ContentKind;
    if (!KINDS.includes(kind)) throw new ContentSchemaError(`${path}.kind must be one of ${KINDS.join(', ')}`);
    const locale = String(item.locale ?? '') as ContentLocale;
    if (locale !== 'ru' && locale !== 'kk') throw new ContentSchemaError(`${path}.locale must be ru or kk`);

    const text = (value: unknown, field: string, max: number): string => {
      const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
      if (!trimmed) throw new ContentSchemaError(`${path}.${field} must not be empty`);
      if (trimmed.length > max) throw new ContentSchemaError(`${path}.${field} exceeds ${max} characters`);
      return trimmed;
    };

    return {
      kind,
      locale,
      ordinal: Math.max(1, Math.trunc(Number(item.ordinal ?? 1)) || 1),
      // Newlines survive in scripts: a storyboard without line breaks is unusable.
      body: (() => {
        const value = String(item.body ?? '').trim();
        if (!value) throw new ContentSchemaError(`${path}.body must not be empty`);
        if (value.length > CHANNEL_LIMITS[kind]) throw new ContentSchemaError(`${path}.body exceeds the ${kind} limit`);
        return value;
      })(),
      cta: text(item.cta, 'cta', 60),
      altText: text(item.altText, 'altText', 200),
      channel: input.channel,
      reviewStatus: locale === 'kk' ? 'native_review_required' : 'auto_checked',
      charLimit: CHANNEL_LIMITS[kind],
    };
  });

  const completeness = checkPackCompleteness(assets, ['ru', 'kk']);
  if (!completeness.complete) throw new ContentSchemaError(`pack is incomplete: ${completeness.missing.slice(0, 3).join('; ')}`);

  // A Kazakh asset identical to its Russian pair is the model being lazy, and
  // shipping it would make the bilingual claim false.
  for (const [kind, count] of EXPECTED_ASSETS) {
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      const ru = assets.find((asset) => asset.kind === kind && asset.locale === 'ru' && asset.ordinal === ordinal);
      const kk = assets.find((asset) => asset.kind === kind && asset.locale === 'kk' && asset.ordinal === ordinal);
      if (ru && kk && ru.body === kk.body) throw new ContentSchemaError(`pack.${kind}#${ordinal} repeats the Russian text as Kazakh`);
    }
  }

  return assets;
}

export interface PackCompleteness {
  complete: boolean;
  missing: string[];
  nativeReviewRequired: ContentLocale[];
}

/** Structural completeness gate used by the UI and by tests. */
export function checkPackCompleteness(assets: readonly ContentAsset[], locales: readonly ContentLocale[]): PackCompleteness {
  const missing: string[] = [];
  const expected: [ContentKind, number][] = [['post', 1], ['short_post', 1], ['story', 3], ['video_script', 1], ['direct_message', 1]];

  for (const locale of locales) {
    for (const [kind, count] of expected) {
      const found = assets.filter((asset) => asset.kind === kind && asset.locale === locale);
      if (found.length < count) missing.push(`${locale}:${kind} (${found.length}/${count})`);
      for (const asset of found) {
        if (!asset.body.trim()) missing.push(`${locale}:${kind} пустой текст`);
        if (!asset.cta.trim()) missing.push(`${locale}:${kind} без CTA`);
        if (!asset.altText.trim()) missing.push(`${locale}:${kind} без alt text`);
        if (asset.body.length > asset.charLimit) missing.push(`${locale}:${kind} превышает лимит канала`);
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    nativeReviewRequired: locales.filter((locale) => assets.some((asset) => asset.locale === locale && asset.reviewStatus === 'native_review_required')),
  };
}
