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
