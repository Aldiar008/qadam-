/**
 * Заготовленные ответы для демонстрации.
 *
 * On the free Gemini tier a live demonstration hits 429 within a few presses and
 * every answer drops to the built-in template. That is honest but it is not what
 * the product does when it is paid for, so a judge would be shown the fallback
 * and told to imagine the real thing.
 *
 * This provider returns curated answers of exactly the shape the real one must
 * produce — the same schema, validated by the same parser, held to the same
 * «no invented numbers» rule. It is slow on purpose: a generation that returns
 * instantly reads as a lookup, which is what it is, and the pause is where the
 * work would be.
 *
 * It is a **provider**, not a bypass. The answers still go through
 * `parseCampaignProposal` / `parseGeneratedPack` / `parseGuestReply`, so a
 * mistake here fails the same way a model's would. And it is selected only by
 * `QADAM_AI_PROVIDER=demo`, never automatically: nothing silently pretends to
 * think.
 */

import {
  AiProviderError,
  CAMPAIGN_SCHEMA_VERSION,
  REPLY_SCHEMA_VERSION,
  type AiProvider,
  type AiRequest,
  type AiResponse,
} from './contract.ts';
import { CONTENT_SCHEMA_VERSION, SOCIAL_SCHEMA_VERSION } from './content-pack.ts';

/** How long a real generation of this kind takes, roughly. */
const THINKING_MS: Record<string, number> = {
  campaign_generation: 4200,
  content_generation: 5200,
  automation_content: 5800,
  customer_brief: 2600,
  guest_reply: 1700,
};

interface Facts {
  menu: { name: string; priceMinor: number }[];
  venue: string;
  offerRu: string;
  offerKk: string;
  trackingCode: string;
  durationDays: number;
  quietWindow: string;
  goal: string;
  channel: string;
  locales: string[];
  reward: string | null;
  guestStamps: number | null;
  question: string;
  segmentLabel: string;
  segmentSize: number;
  eligible: number;
  cheapest: { name: string; priceMinor: number; costMinor: number } | null;
  threshold: number;
  aov: number;
}

/**
 * Reads back the facts the prompt carried.
 *
 * The canned answers must be about *this* venue, or they are worse than the
 * template — a demonstration that names somebody else's coffee is the exact
 * failure this product exists to avoid.
 */
function readFacts(request: AiRequest): Facts {
  const block = /<(?:business_data|campaign_data|venue_facts|guest_data)>\s*([\s\S]*?)\s*<\//.exec(request.user);
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(block?.[1] ?? '{}') as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const menuRaw = (payload.menu ?? payload.catalog ?? []) as { name?: string; priceMinor?: number; costMinor?: number }[];
  const menu = menuRaw.filter((item) => item && typeof item.name === 'string')
    .map((item) => ({ name: String(item.name), priceMinor: Number(item.priceMinor ?? 0) }));
  const cheapestRaw = [...menuRaw].filter((item) => Number(item?.priceMinor ?? 0) > 0)
    .sort((a, b) => Number(a.priceMinor) - Number(b.priceMinor))[0];
  const offer = (payload.offer ?? {}) as { ru?: string; kk?: string };
  const segment = (payload.segment ?? {}) as { label?: string; size?: number; consentEligible?: number };
  const guest = (payload.guest ?? {}) as { stamps?: number };
  const rewards = (payload.rewards ?? []) as { name?: string }[];
  const aov = Number(payload.averageOrderValueMinor ?? 3450);

  return {
    menu,
    venue: String(payload.venue ?? payload.businessName ?? payload.businessType ?? 'Заведение'),
    offerRu: String(offer.ru ?? payload.offer ?? 'персональное предложение'),
    offerKk: String(offer.kk ?? payload.offer ?? 'жеке ұсыныс'),
    trackingCode: String(payload.trackingCode ?? 'QDM-DEMO'),
    durationDays: Number(payload.durationDays ?? 7),
    quietWindow: String(payload.quietWindow ?? '15:00–18:00'),
    goal: String(payload.goal ?? 'reactivate'),
    channel: String(payload.channel ?? 'telegram'),
    locales: Array.isArray(payload.locales) ? (payload.locales as string[]) : ['ru', 'kk'],
    reward: rewards[0]?.name ? String(rewards[0].name) : (payload.reward ? String(payload.reward) : null),
    guestStamps: typeof guest.stamps === 'number' ? guest.stamps : null,
    question: (/<guest_question>\s*([\s\S]*?)\s*<\//.exec(request.user)?.[1] ?? '').trim(),
    segmentLabel: String(segment.label ?? 'Спящие гости'),
    segmentSize: Number(segment.size ?? 0),
    eligible: Number(segment.consentEligible ?? 0),
    cheapest: cheapestRaw
      ? { name: String(cheapestRaw.name), priceMinor: Number(cheapestRaw.priceMinor), costMinor: Number(cheapestRaw.costMinor ?? Math.round(Number(cheapestRaw.priceMinor) * 0.6)) }
      : null,
    threshold: Math.max(500, Math.round((aov * 1.02) / 100) * 100),
    aov,
  };
}

const money = (minor: number) => `${Number(minor).toLocaleString('ru-RU')} ₸`;

function campaignAnswer(f: Facts): unknown {
  const giftName = f.cheapest?.name ?? 'напиток';
  const giftCost = f.cheapest?.costMinor ?? 600;
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    goal: f.goal,
    mechanics: [
      {
        kind: 'gift_with_threshold',
        benefitValue: giftCost,
        thresholdMinor: f.threshold,
        durationDays: 7,
        channel: f.channel,
        hypothesis: `Гость добирает чек до ${f.threshold} ₸ ради подарка, поэтому средний чек растёт, а скидку не получают те, кто купил бы и так.`,
        audienceSummary: `${f.segmentLabel}: ${f.eligible} человек с действующим согласием из ${f.segmentSize}.`,
        whyFit: 'Порог выше среднего чека — выгода отдаётся только там, где заказ и так стал больше.',
        risks: ['Часть гостей и так превышала порог', `Нужен запас позиции «${giftName}»`],
        requiredAssumptions: [`Себестоимость подарка ${giftCost} ₸`, `Порог ${f.threshold} ₸ выше среднего чека`],
        copy: {
          ru: { title: `${giftName} в подарок`, body: `Мы соскучились. При заказе от ${f.threshold} ₸ дарим ${giftName.toLowerCase()} — просто назовите код на кассе.`, cta: 'Забрать подарок' },
          kk: { title: `${giftName} сыйлыққа`, body: `Сізді сағындық. ${f.threshold} ₸-ден бастап тапсырысқа ${giftName.toLowerCase()} сыйлаймыз — кассада кодты айтыңыз.`, cta: 'Сыйлықты алу' },
        },
      },
      {
        kind: 'happy_hours',
        benefitValue: 1500,
        thresholdMinor: 0,
        durationDays: 14,
        channel: f.channel,
        hypothesis: `Скидка только в окно ${f.quietWindow} перераспределяет спрос в пустые часы, не трогая пик.`,
        audienceSummary: `Те же ${f.eligible} гостей, но приглашение в конкретное время.`,
        whyFit: 'Выгода ограничена по времени, поэтому пиковые часы остаются с полной маржой.',
        risks: ['Часть пикового спроса может сместиться', 'Нужен контроль на кассе'],
        requiredAssumptions: [`Окно ${f.quietWindow}`, 'Только будни'],
        copy: {
          ru: { title: `Тихие часы ${f.quietWindow}`, body: `С ${f.quietWindow} у нас спокойно и на 15% дешевле. Хорошее время, чтобы посидеть с ноутбуком.`, cta: 'Зайти днём' },
          kk: { title: `Тыныш сағаттар ${f.quietWindow}`, body: `${f.quietWindow} аралығында бізде тыныш әрі 15% арзан. Ноутбукпен отыруға қолайлы уақыт.`, cta: 'Күндіз келу' },
        },
      },
      {
        kind: 'percentage_discount',
        benefitValue: 2000,
        thresholdMinor: 0,
        durationDays: 7,
        channel: f.channel,
        hypothesis: 'Прямая скидка 20% даёт самый заметный отклик и самый дорогой.',
        audienceSummary: 'Вариант для сравнения — сервер посчитает, допустим ли он.',
        whyFit: 'Показывает, как выглядит агрессивная механика рядом с безопасной.',
        risks: ['Скидку получают и те, кто пришёл бы без неё', 'Вклад-маржа может уйти ниже порога'],
        requiredAssumptions: ['Скидка на весь чек', 'Каннибализация не менее 15%'],
        copy: {
          ru: { title: 'Скидка 20%', body: 'Дарим 20% на весь заказ на этой неделе.', cta: 'Получить скидку' },
          kk: { title: '20% жеңілдік', body: 'Осы аптада бүкіл тапсырысқа 20% сыйлаймыз.', cta: 'Жеңілдік алу' },
        },
      },
    ],
    notes: [],
  };
}

function contentAnswer(f: Facts): unknown {
  const assets: Record<string, unknown>[] = [];
  const push = (kind: string, locale: string, ordinal: number, body: string, cta: string, altText: string) =>
    assets.push({ kind, locale, ordinal, body, cta, altText });

  push('post', 'ru', 1,
    `${f.venue}. Мы заметили, что вы давно не заходили — и приготовили повод вернуться.\n\n${f.offerRu}. Предложение действует ${f.durationDays} дней и адресовано только тем, кто дал согласие на сообщения.\n\nПокажите код ${f.trackingCode} на кассе — так мы поймём, что вы пришли именно по нему.`,
    'Забрать предложение', `Предложение «${f.offerRu}» в ${f.venue}`);
  push('post', 'kk', 1,
    `${f.venue}. Сізді көптен бері көрмедік — қайта оралуға себеп дайындадық.\n\n${f.offerKk}. Ұсыныс ${f.durationDays} күн жарамды және тек хабарлама алуға келісім бергендерге арналған.\n\nКассада ${f.trackingCode} кодын көрсетіңіз.`,
    'Ұсынысты алу', `${f.venue} мекемесіндегі «${f.offerKk}» ұсынысы`);

  push('short_post', 'ru', 1, `${f.offerRu}. Только для наших гостей, ${f.durationDays} дней. Код ${f.trackingCode}.`, 'Подробнее', `Карточка предложения «${f.offerRu}»`);
  push('short_post', 'kk', 1, `${f.offerKk}. Тек біздің қонақтарға, ${f.durationDays} күн. Коды ${f.trackingCode}.`, 'Толығырақ', `«${f.offerKk}» карточкасы`);

  const storiesRu: [string, string, string][] = [
    ['Давно вас не видели', 'Мы заметили, что вы к нам давно не заходили.', 'Смахните вверх'],
    ['Что мы приготовили', f.offerRu, 'Смотреть условия'],
    [`Успейте за ${f.durationDays} дней`, `Покажите код ${f.trackingCode} на кассе.`, 'Забрать'],
  ];
  const storiesKk: [string, string, string][] = [
    ['Сізді көптен көрмедік', 'Бізге келмегеніңізге көп болды.', 'Жоғары сырғытыңыз'],
    ['Не дайындадық', f.offerKk, 'Шарттарын көру'],
    [`${f.durationDays} күн ішінде үлгеріңіз`, `Кассада ${f.trackingCode} кодын көрсетіңіз.`, 'Алу'],
  ];
  storiesRu.forEach(([title, body, cta], index) => push('story', 'ru', index + 1, `${title}. ${body}`, cta, `Сторис ${index + 1}: ${title}`));
  storiesKk.forEach(([title, body, cta], index) => push('story', 'kk', index + 1, `${title}. ${body}`, cta, `Сторис ${index + 1}: ${title}`));

  push('video_script', 'ru', 1,
    `[0–3 с] Крупный план: чашка на стойке, пар.\n[3–7 с] Текст на экране: «${f.offerRu}».\n[7–11 с] Гость забирает заказ, в кадре вывеска ${f.venue}.\n[11–15 с] Финал: код ${f.trackingCode} и призыв зайти в ближайшие ${f.durationDays} дней.`,
    'Зайти на этой неделе', `Сценарий вертикального видео о «${f.offerRu}»`);
  push('video_script', 'kk', 1,
    `[0–3 с] Ірі план: тұғырдағы кесе.\n[3–7 с] Экранда: «${f.offerKk}».\n[7–11 с] Қонақ тапсырысын алады, кадрда ${f.venue}.\n[11–15 с] Соңы: ${f.trackingCode} коды және ${f.durationDays} күн ішінде келуге шақыру.`,
    'Осы аптада келу', `«${f.offerKk}» туралы тік бейне`);

  push('direct_message', 'ru', 1,
    `Здравствуйте! Это ${f.venue}. Мы соскучились. Для вас: ${f.offerRu}. Предложение личное, действует ${f.durationDays} дней. Назовите код ${f.trackingCode} на кассе. Если больше не хотите получать сообщения — ответьте «стоп».`,
    'Показать на кассе', `Сообщение с предложением «${f.offerRu}»`);
  push('direct_message', 'kk', 1,
    `Сәлеметсіз бе! Бұл — ${f.venue}. Сізге: ${f.offerKk}. Ұсыныс жеке, ${f.durationDays} күн жарамды. Кассада ${f.trackingCode} кодын айтыңыз. Хабарлама алғыңыз келмесе — «тоқта» деп жауап беріңіз.`,
    'Кассада көрсету', `«${f.offerKk}» хабарламасы`);

  return { schemaVersion: CONTENT_SCHEMA_VERSION, assets };
}

function socialAnswer(f: Facts): unknown {
  const hero = f.menu[Math.min(2, Math.max(0, f.menu.length - 1))] ?? { name: 'фирменный напиток', priceMinor: 0 };
  const price = hero.priceMinor ? ` (${money(hero.priceMinor)})` : '';
  const assets: Record<string, unknown>[] = [];
  const push = (kind: string, locale: string, title: string, body: string, cta: string, needs: string[]) =>
    assets.push({ kind, locale, title, body, cta, needs });

  for (const locale of f.locales) {
    const ru = locale === 'ru';
    push('reel_script', locale,
      ru ? `Reels: ${f.offerRu}` : `Reels: ${f.offerKk}`,
      ru
        ? `[0–2 с] Хук: крупный план ${hero.name.toLowerCase()}${price}, пар поднимается, звук — шипение пара.\n[2–5 с] Руки бариста, текст на экране: «${f.offerRu}».\n[5–9 с] Панорама зала, гость садится к окну.\n[9–13 с] Гость делает первый глоток, лёгкая улыбка.\n[13–15 с] Финальный кадр: вывеска ${f.venue}, текст «${f.offerRu}».\n\nГотовый промпт для видео-AI (Kling / Higgsfield):\n"Cinematic vertical 9:16, cozy specialty coffee shop in Almaty, warm morning light through large windows, close-up of ${hero.name.toLowerCase()} with rising steam, barista hands in frame, shallow depth of field, 35mm, natural color grade, slow push-in, no text overlay"`
        : `[0–2 с] Хук: ${hero.name.toLowerCase()} ірі планда.\n[2–5 с] Бариста қолдары, экранда: «${f.offerKk}».\n[5–9 с] Залдың панорамасы.\n[9–13 с] Қонақ алғаш ұрттайды.\n[13–15 с] Соңғы кадр: ${f.venue}.\n\nВидео-AI үшін дайын промпт:\n"Cinematic vertical 9:16, cozy coffee shop, warm light, close-up of ${hero.name.toLowerCase()}, steam, shallow depth of field, slow push-in"`,
      ru ? 'Зайти на этой неделе' : 'Осы аптада келу',
      ru ? ['Протереть стойку и стекло', 'Снимать до 11:00 при дневном свете', 'Один гость-доброволец'] : ['Тұғырды сүрту', '11:00-ге дейін түсіру', 'Бір қонақ']);

    push('tiktok_script', locale,
      ru ? 'TikTok: три причины зайти' : 'TikTok: келуге үш себеп',
      ru
        ? `Хук (0–2 с): текст на экране «3 причины зайти к нам на этой неделе».\n1 (2–6 с): ${hero.name}${price}.\n2 (6–10 с): ${f.offerRu}.\n3 (10–14 с): ${f.reward ?? 'карта лояльности: штампы за каждый визит'}.\nФинал (14–15 с): адрес и часы работы на экране.\n\nЗвук: трендовый, темп средний. Монтаж: жёсткие склейки на каждой цифре.`
        : `Хук (0–2 с): «Осы аптада келуге 3 себеп».\n1 (2–6 с): ${hero.name}${price}.\n2 (6–10 с): ${f.offerKk}.\n3 (10–14 с): ${f.reward ?? 'адалдық картасы'}.\nСоңы: мекенжай мен жұмыс уақыты.`,
      ru ? 'Смотреть условия' : 'Шарттарын көру',
      ru ? ['Три коротких кадра по 4 секунды', 'Крупный текст на экране'] : ['Үш қысқа кадр', 'Экранда ірі мәтін']);

    push('photo_brief', locale,
      ru ? 'Фото: витрина и напиток' : 'Фото: витрина мен сусын',
      ru
        ? `Кадр 1: ${hero.name.toLowerCase()} на деревянной стойке, свет сбоку из окна, фон размыт.\nКадр 2: витрина целиком, видно вывеску.\nКадр 3: руки гостя с картой лояльности.\n\nПодпись: «${f.offerRu}».\n\nГотовый промпт для Nano Banana / Midjourney:\n"Top-down and 45-degree product photo of ${hero.name.toLowerCase()} on warm oak counter, soft window light from left, cozy blurred cafe interior background, film grain, natural tones, 50mm, high detail, no text"`
        : `1-кадр: ${hero.name.toLowerCase()} ағаш үстелде, терезеден жарық.\n2-кадр: витрина толық.\n3-кадр: қонақтың қолындағы карта.\n\nҚолтаңба: «${f.offerKk}».\n\nNano Banana үшін промпт:\n"Product photo of ${hero.name.toLowerCase()} on oak counter, soft window light, cozy cafe background, natural tones, 50mm"`,
      ru ? 'Забрать предложение' : 'Ұсынысты алу',
      ru ? [`Снимать в ${f.quietWindow} — меньше людей в кадре`, 'Протереть посуду'] : [`${f.quietWindow} аралығында түсіру`, 'Ыдысты сүрту']);

    push('story_series', locale,
      ru ? 'Сторис: три кадра' : 'Сторис: үш кадр',
      ru
        ? `1. «Мы на месте» — кадр витрины, текст: ${f.venue}.\n2. «Что сегодня» — ${f.offerRu}.\n3. «Как получить» — карта лояльности${f.reward ? ` и награда: ${f.reward}` : ''}, стикер «Написать нам».`
        : `1. «Біз осындамыз» — витрина, ${f.venue}.\n2. «Бүгін не бар» — ${f.offerKk}.\n3. «Қалай алуға болады» — адалдық картасы${f.reward ? `, сыйлық: ${f.reward}` : ''}.`,
      ru ? 'Смахните вверх' : 'Жоғары сырғытыңыз',
      ru ? ['Три вертикальных кадра', 'Стикер с вопросом в третьем'] : ['Үш тік кадр']);

    push('push_notice', locale,
      ru ? 'Уведомление гостям' : 'Қонақтарға хабарлама',
      ru
        ? `${f.venue}: ${f.offerRu}.${f.reward ? ` На карте копятся штампы — ${f.reward}.` : ''} Ждём вас.`
        : `${f.venue}: ${f.offerKk}.${f.reward ? ` Картада мөрлер жиналады — ${f.reward}.` : ''} Күтеміз.`,
      ru ? 'Открыть карту' : 'Картаны ашу',
      ru ? ['Уходит только тем, кто дал согласие'] : ['Тек келісім бергендерге']);
  }

  return { schemaVersion: SOCIAL_SCHEMA_VERSION, assets };
}

function briefAnswer(request: AiRequest): unknown {
  const block = /<guest_data>\s*([\s\S]*?)\s*<\//.exec(request.user)?.[1] ?? '{}';
  let guest: Record<string, unknown> = {};
  try {
    guest = ((JSON.parse(block) as { guest?: Record<string, unknown> }).guest ?? {});
  } catch {
    guest = {};
  }
  const name = String(guest.name ?? 'Гость');
  const visits = Number(guest.visits ?? 0);
  const aov = Number(guest.averageCheckMinor ?? 0);
  const days = guest.daysSinceLastVisit === null || guest.daysSinceLastVisit === undefined ? null : Number(guest.daysSinceLastVisit);
  const consents = (guest.consents ?? []) as { scope: string; status: string }[];
  const marketing = consents.find((item) => String(item.scope).startsWith('marketing'));
  const granted = marketing?.status === 'granted';

  const observations = [
    visits > 0 ? `Визитов ${visits}, средний чек ${aov} — это устойчивая привычка, а не случайный заход.` : 'Покупок за гостем ещё не записано.',
    days === null ? 'Дата последнего визита неизвестна.' : days >= 30 ? `Не заходил ${days} дней — уже спящий.` : `Последний визит ${days} дней назад.`,
    granted ? 'Согласие на рассылку действует — писать можно.' : 'Действующего согласия нет: в кампанию не попадёт.',
  ];

  return {
    schemaVersion: 'customer-brief.v1',
    summary: visits > 0
      ? `${name} — постоянный гость: ${visits} визитов со средним чеком ${aov}. Для заведения это тот случай, когда одно напоминание дешевле любой рекламы.`
      : `${name} только что завёл карту, покупок пока нет.`,
    observations,
    nextStep: granted
      ? (days !== null && days >= 30
        ? 'Добавить в ближайшую кампанию возврата — согласие есть, повод есть.'
        : 'Держать в постоянных: писать сейчас не о чем, и это нормально.')
      : 'Получить согласие при следующем визите — без него любая кампания его исключит.',
    cautions: ['Это разбор по имеющимся данным, а не вывод о причинах поведения гостя.'],
  };
}

function replyAnswer(f: Facts): unknown {
  const asked = f.question.toLowerCase();
  const parts: string[] = [];
  const used: string[] = [];

  const named = f.menu.find((item) => asked.includes(item.name.toLowerCase().split(' ')[0]));
  if (named) {
    parts.push(`${named.name} — ${money(named.priceMinor)}.`);
    used.push('меню');
  } else if (/меню|цен|стоит|сколько|кофе/.test(asked) && f.menu.length) {
    parts.push(`Из меню: ${f.menu.slice(0, 3).map((item) => `${item.name} — ${money(item.priceMinor)}`).join(', ')}.`);
    used.push('меню');
  }

  if (/лояль|штамп|карт|бонус|бесплат|постоян/.test(asked)) {
    if (f.reward) { parts.push(`За визиты копятся штампы: ${f.reward}.`); used.push('программа лояльности'); }
    if (f.guestStamps !== null) { parts.push(`Сейчас у вас ${f.guestStamps}.`); used.push('баланс гостя'); }
  }

  if (!parts.length) {
    return {
      schemaVersion: REPLY_SCHEMA_VERSION,
      reply: 'Я передам ваш вопрос сотруднику заведения — он ответит здесь же. Могу сразу подсказать про меню, часы работы и вашу карту лояльности.',
      usedFacts: [],
      needsHuman: true,
    };
  }

  return { schemaVersion: REPLY_SCHEMA_VERSION, reply: `${parts.join(' ')} Будем рады видеть вас.`, usedFacts: used, needsHuman: false };
}

export function createDemoProvider(options: { delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}): AiProvider {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  return {
    name: 'demo',
    model: 'qadam-demo-answers-v1',
    async complete(request: AiRequest, signal: AbortSignal): Promise<AiResponse> {
      const facts = readFacts(request);
      const think = options.delayMs ?? THINKING_MS[request.purpose] ?? 2500;

      // Abortable: a demonstration that ignores the timeout would hide the very
      // behaviour the timeout exists to prove.
      await Promise.race([
        sleep(think),
        new Promise<never>((_, reject) => {
          if (signal.aborted) reject(new AiProviderError('timeout', 'aborted before answering', { retryable: true }));
          signal.addEventListener('abort', () => reject(new AiProviderError('timeout', 'aborted while answering', { retryable: true })), { once: true });
        }),
      ]);

      const answer = request.purpose === 'campaign_generation' ? campaignAnswer(facts)
        : request.purpose === 'content_generation' ? contentAnswer(facts)
        : request.purpose === 'automation_content' ? socialAnswer(facts)
        : request.purpose === 'customer_brief' ? briefAnswer(request)
        : replyAnswer(facts);

      const text = JSON.stringify(answer);
      return { text, model: 'qadam-demo-answers-v1', inputTokens: Math.ceil(request.user.length / 4), outputTokens: Math.ceil(text.length / 4) };
    },
  };
}
