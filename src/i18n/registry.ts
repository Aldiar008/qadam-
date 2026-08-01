/**
 * Locale architecture.
 *
 * Two rules make adding a third language a data change rather than a rewrite:
 *
 *  1. A message is looked up by key and receives named parameters. UI text is
 *     never assembled by concatenating fragments, because word order and
 *     agreement differ per language and a concatenated string cannot be
 *     translated correctly.
 *  2. Plural forms come from `Intl.PluralRules`, not from an `n === 1` check.
 *     Russian has three forms (one / few / many); Kazakh has two; English has
 *     two. A hand-rolled check silently produces wrong Russian.
 *
 * Domain logic never imports this module: formulas work in minor units with
 * currency metadata, and only the presentation layer formats them.
 */

export const SUPPORTED_LOCALES = ['ru', 'kk'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'ru';

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export type PluralCategory = 'one' | 'few' | 'many' | 'other';
type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };
type Message = string | PluralForms;

/**
 * Glossary: terms that must be translated consistently everywhere, and terms
 * that must deliberately stay untranslated. Reviewed alongside the copy.
 */
export const GLOSSARY: readonly { term: string; ru: string; kk: string; note: string }[] = [
  { term: 'Growth Contract', ru: 'Growth Contract', kk: 'Growth Contract', note: 'Product term. Never translated: it names a specific, versioned artefact.' },
  { term: 'Margin Shield', ru: 'Margin Shield', kk: 'Margin Shield', note: 'Product term. Never translated.' },
  { term: 'contribution margin', ru: 'вклад-маржа', kk: 'үлес-маржа', note: 'Always this exact pair; not "прибыль".' },
  { term: 'influenced revenue', ru: 'выручка контактировавших', kk: 'байланысқандардың түсімі', note: 'Never rendered as "прирост".' },
  { term: 'incremental revenue', ru: 'прирост выручки', kk: 'түсім өсімі', note: 'Only used when a baseline exists.' },
  { term: 'consent', ru: 'согласие', kk: 'келісім', note: 'Legal term; not "подписка".' },
  { term: 'suppression list', ru: 'список исключений', kk: 'ерекшелік тізімі', note: 'Not "чёрный список".' },
  { term: 'quiet hours', ru: 'тихие часы', kk: 'тыныш сағаттар', note: 'Both the capacity window and the send-blocking window.' },
  { term: 'stop-rule', ru: 'правило остановки', kk: 'тоқтату ережесі', note: 'Consistent across contract and automation copy.' },
  { term: 'owner', ru: 'владелец', kk: 'иесі', note: 'The tenant role, not a generic user.' },
];

const MESSAGES: Record<AppLocale, Record<string, Message>> = {
  ru: {
    'customers.count': { one: '{count} клиент', few: '{count} клиента', many: '{count} клиентов', other: '{count} клиента' },
    'customers.eligible': { one: '{count} клиент с действующим согласием', few: '{count} клиента с действующим согласием', many: '{count} клиентов с действующим согласием', other: '{count} клиента с действующим согласием' },
    'days.count': { one: '{count} день', few: '{count} дня', many: '{count} дней', other: '{count} дня' },
    'campaigns.count': { one: '{count} кампания', few: '{count} кампании', many: '{count} кампаний', other: '{count} кампании' },
    'segment.reduction': 'В сегменте {segment}: {total} — согласие для канала {channel} есть у {eligible}',
    'plan.limitReached': 'Лимит тарифа {plan}: использовано {used} из {limit}. Черновик сохранён.',
    'invitation.expires': 'Приглашение действует до {date}',
    'contract.approvedBy': 'Подтверждено {actor} · {date}',
  },
  kk: {
    'customers.count': { one: '{count} клиент', other: '{count} клиент' },
    'customers.eligible': { one: 'келісімі бар {count} клиент', other: 'келісімі бар {count} клиент' },
    'days.count': { one: '{count} күн', other: '{count} күн' },
    'campaigns.count': { one: '{count} науқан', other: '{count} науқан' },
    'segment.reduction': '{segment} сегментінде: {total} — {channel} арнасына келісім {eligible} адамда бар',
    'plan.limitReached': '{plan} тарифінің шегі: {limit} ішінен {used} пайдаланылды. Жоба сақталды.',
    'invitation.expires': 'Шақыру {date} дейін жарамды',
    'contract.approvedBy': '{actor} растады · {date}',
  },
};

const pluralRules = new Map<AppLocale, Intl.PluralRules>();

function rulesFor(locale: AppLocale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules;
}

export interface TranslateParams {
  count?: number;
  [key: string]: string | number | undefined;
}

/**
 * Looks up a message and fills its named parameters.
 *
 * A missing key returns the key itself rather than an empty string: a visible
 * `customers.count` in the UI is a bug report; an empty span is a silent one.
 */
export function translate(locale: AppLocale, key: string, params: TranslateParams = {}): string {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const entry = table[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  if (entry === undefined) return key;

  let template: string;
  if (typeof entry === 'string') {
    template = entry;
  } else {
    const category = params.count === undefined
      ? 'other'
      : (rulesFor(locale).select(params.count) as PluralCategory);
    template = entry[category] ?? entry.other;
  }

  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

/** Per-business currency and timezone, formatted with Intl rather than by hand. */
export function formatMoney(minor: number, currency: string, locale: AppLocale): string {
  // KZT has no circulating subunit in this product, so the stored minor unit is
  // the tenge itself and no scaling is applied here.
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor);
}

export function formatDateTime(value: string | Date, timeZone: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone,
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(bps: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(bps / 10_000);
}

/**
 * Longest rendering of a key across locales, used to check that a layout
 * survives translation. Kazakh and Russian both run longer than English, so a
 * component sized to the Russian string is the realistic worst case here.
 */
export function longestRendering(key: string, params: TranslateParams = {}): { locale: AppLocale; text: string; length: number } {
  return SUPPORTED_LOCALES
    .map((locale) => ({ locale, text: translate(locale, key, params) }))
    .map((entry) => ({ ...entry, length: entry.text.length }))
    .sort((a, b) => b.length - a.length)[0];
}

export { MESSAGES as MESSAGE_CATALOGUE };
