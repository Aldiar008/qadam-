/**
 * What a guest is told when the loyalty desk refuses.
 *
 * The page used to print the database's own words: «customer not found»,
 * «insufficient loyalty balance». Both are accurate and neither tells a person
 * standing at a till what to do next — the first one in particular reads like
 * the product lost their card, when it means «this address has not joined yet».
 */
const MESSAGES: readonly { match: RegExp; text: string }[] = [
  { match: /customer not found/i, text: 'С этим адресом карта ещё не заводилась. Присоединитесь формой выше — тем же email или телефоном, что укажете на кассе.' },
  { match: /insufficient loyalty balance/i, text: 'Штампов пока не хватает на эту награду. Ваш баланс показан выше — он растёт с каждым визитом.' },
  { match: /loyalty account not found/i, text: 'Карта есть, но счёт по этой программе не заведён. Покажите QR-код на кассе — счёт откроется.' },
  { match: /reward inventory exhausted/i, text: 'Эту награду уже разобрали. Заведение скоро добавит ещё.' },
  { match: /reward not found/i, text: 'Такой награды в этой программе нет. Обновите страницу — список мог измениться.' },
  { match: /QR code is invalid or expired/i, text: 'QR-код отозван или устарел. Отсканируйте код на кассе ещё раз.' },
  { match: /loyalty consent is required/i, text: 'Без согласия на участие в программе карту завести нельзя — это требование закона, а не форма.' },
  { match: /rate limit|too many/i, text: 'Слишком много попыток подряд. Подождите пару минут и повторите.' },
  { match: /identity verification is required/i, text: 'Для боевого заведения нужна настоящая проверка личности, а она пока не подключена.' },
  { match: /verification_not_connected/i, text: 'Проверка личности не подключена, поэтому присоединение отключено. Это ограничение, а не сбой.' },
  { match: /invalid join input|invalid redeem input/i, text: 'Проверьте адрес: нужен настоящий email или телефон.' },
];

export function describeLoyaltyError(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim();
  if (!text) return 'Не получилось выполнить действие. Попробуйте ещё раз через минуту.';
  const found = MESSAGES.find((entry) => entry.match.test(text));
  // An unrecognised failure is shown as it came, not swallowed: a guest seeing
  // an odd sentence can quote it, and a hidden error helps nobody.
  return found ? found.text : `Не получилось: ${text}`;
}
