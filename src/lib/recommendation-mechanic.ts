/**
 * Переносит рекомендацию в форму кампании.
 *
 * «Собрать кампанию» opened the studio with the recommendation id attached and
 * every field still on its factory setting: whichever suggestion the owner had
 * chosen, the form offered the same gift at the same threshold. The suggestion
 * has to arrive in the form, or the two screens are only linked by a URL.
 *
 * The mechanic is read from the recommendation itself where the generator wrote
 * one, and inferred from its title otherwise — old rows predate the field, and
 * a suggestion the owner can see should not behave differently from a new one.
 */

export type MechanicCode =
  | 'gift_with_threshold' | 'percentage_discount' | 'fixed_discount'
  | '2_plus_1' | 'happy_hours' | 'return_coupon' | 'bonus_points';

export interface MechanicDefaults {
  mechanic: MechanicCode;
  /** Benefit size: bps for percentage kinds, tenge otherwise. */
  amount: number;
  thresholdMinor: number;
  durationDays: number;
  /** Why the form arrived pre-filled, shown to the owner. */
  because: string;
}

const KEYWORDS: readonly { match: RegExp; mechanic: MechanicCode; because: string }[] = [
  { match: /счастлив|тихие часы|провал в часы|quiet/i, mechanic: 'happy_hours', because: 'скидка действует только в провальном окне, а не весь день' },
  { match: /купон|вернуть|спящ|возврат/i, mechanic: 'return_coupon', because: 'купон переносит выгоду на второй визит: платит только тот, кто вернулся' },
  { match: /порог|подарок|gift/i, mechanic: 'gift_with_threshold', because: 'подарок при чеке выше среднего поднимает чек, не раздавая скидку всем' },
  { match: /средний чек|aov/i, mechanic: 'gift_with_threshold', because: 'порог поднимает чек, не раздавая скидку всем' },
  { match: /балл|бонус/i, mechanic: 'bonus_points', because: 'баллы возвращают гостя, не уменьшая выручку сегодня' },
  { match: /новых|второй визит|welcome/i, mechanic: '2_plus_1', because: 'третья чашка бесплатно доводит нового гостя до привычки' },
];

const CODES = new Set<MechanicCode>(['gift_with_threshold', 'percentage_discount', 'fixed_discount', '2_plus_1', 'happy_hours', 'return_coupon', 'bonus_points']);

export function mechanicFromRecommendation(
  explanation: unknown,
  title: string,
  economics: { averageCheckMinor?: number; unitCostMinor?: number },
): MechanicDefaults {
  const raw = (explanation ?? {}) as Record<string, unknown>;
  const stored = String(raw.mechanic ?? '');
  const aov = Math.max(1, Math.round(Number(economics.averageCheckMinor ?? 3450)));
  const unitCost = Math.max(1, Math.round(Number(economics.unitCostMinor ?? Math.round(aov * 0.4))));

  const found = CODES.has(stored as MechanicCode)
    ? { mechanic: stored as MechanicCode, because: 'механика записана в самой рекомендации' }
    : KEYWORDS.find((entry) => entry.match.test(title) || entry.match.test(String(raw.reason ?? '')))
      ?? { mechanic: 'gift_with_threshold' as MechanicCode, because: 'механика по умолчанию: порог защищает маржу' };

  // Threshold just above the average cheque, so the offer only fires on a
  // basket bigger than usual. Rounded to something an owner would print.
  const threshold = Math.max(500, Math.round((aov * 1.02) / 100) * 100);

  switch (found.mechanic) {
    case 'happy_hours':
      return { mechanic: 'happy_hours', amount: 1500, thresholdMinor: 0, durationDays: 14, because: found.because };
    case 'return_coupon':
      return { mechanic: 'return_coupon', amount: Math.round(aov * 0.2), thresholdMinor: 0, durationDays: 14, because: found.because };
    case 'bonus_points':
      return { mechanic: 'bonus_points', amount: 500, thresholdMinor: 0, durationDays: 30, because: found.because };
    case '2_plus_1':
      return { mechanic: '2_plus_1', amount: unitCost, thresholdMinor: 0, durationDays: 21, because: found.because };
    case 'percentage_discount':
      return { mechanic: 'percentage_discount', amount: 1000, thresholdMinor: 0, durationDays: 7, because: found.because };
    case 'fixed_discount':
      return { mechanic: 'fixed_discount', amount: Math.round(aov * 0.15), thresholdMinor: threshold, durationDays: 7, because: found.because };
    case 'gift_with_threshold':
    default:
      return { mechanic: 'gift_with_threshold', amount: unitCost, thresholdMinor: threshold, durationDays: 7, because: found.because };
  }
}
