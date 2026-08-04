/**
 * Что предложить владельцу, исходя из типа заведения и его цели.
 *
 * Положение турнира требует этого дословно: «при регистрации пользователь
 * указывает тип бизнеса, размер и цели — платформа рекомендует подходящие
 * инструменты и маркетинговые решения на основе выбранного профиля». Кофейне —
 * «2+1» и лояльность, салону — скидка на повторное посещение.
 *
 * Каталог одинаков для всех: все двенадцать инструментов работают в кофейне,
 * в салоне и в магазине, и помечать часть из них «несовместимыми» было бы
 * выдумкой. Меняется не список, а порядок и причина: с чего начать именно
 * этому владельцу и почему. Причина всегда называет профиль, из которого она
 * выведена, — иначе это не рекомендация, а украшение.
 *
 * Модуль чистый: ни базы, ни классов Tailwind (их отбрасывает сборка вне
 * `src/components` и `src/app`), только данные.
 */

export type BusinessTypeCode = 'cafe' | 'beauty' | 'retail' | 'service' | 'dental';
export type GoalCode = 'reactivate' | 'acquire' | 'average_check' | 'quiet_hours';

/** Механики, которые действительно умеет Студия кампаний. */
export type MechanicKind =
  | '2_plus_1'
  | 'gift_with_threshold'
  | 'return_coupon'
  | 'fixed_discount'
  | 'percent_discount'
  | 'bonus_points';

export interface ToolCandidate {
  code: string;
  nameRu: string;
  route: string;
  /** Уже закреплён на «Сегодня» — такой не предлагаем, он и так под рукой. */
  active: boolean;
}

export interface ToolSuggestion extends ToolCandidate {
  reason: string;
}

export interface MechanicSuggestion {
  kind: MechanicKind;
  title: string;
  reason: string;
}

const TYPE_LABEL: Record<BusinessTypeCode, string> = {
  cafe: 'кофейне',
  beauty: 'салону',
  retail: 'магазину',
  service: 'сервисной точке',
  dental: 'стоматологии',
};

const GOAL_LABEL: Record<GoalCode, string> = {
  reactivate: 'вернуть спящих',
  acquire: 'привлечь новых',
  average_check: 'поднять средний чек',
  quiet_hours: 'заполнить тихие часы',
};

/**
 * Порядок инструментов под цель. Первый — то, с чего начинать сегодня.
 *
 * Коды те же, что в каталоге (`public.tools.code`): расхождение здесь означало
 * бы рекомендацию несуществующего инструмента, поэтому подбор всегда
 * пересекается с тем, что каталог реально отдал.
 */
const BY_GOAL: Record<GoalCode, string[]> = {
  reactivate: ['winback', 'segments', 'campaign_studio', 'automations', 'qr_loyalty'],
  acquire: ['qr_loyalty', 'content_studio', 'campaign_studio', 'telegram_bot', 'impact_ledger'],
  average_check: ['campaign_studio', 'margin_shield', 'simulator', 'customer_brief', 'impact_ledger'],
  quiet_hours: ['signal_today', 'campaign_studio', 'content_studio', 'automations', 'qr_loyalty'],
};

/** Почему именно этот инструмент — с опорой на тип заведения. */
const WHY: Record<string, Partial<Record<BusinessTypeCode, string>> & { any: string }> = {
  winback: {
    any: 'находит тех, кто перестал приходить, и у кого есть действующее согласие',
    cafe: 'гость кофейни выпадает из привычки за две-три недели — этот список показывает, кто уже выпал',
    beauty: 'в салоне цикл длиннее: список ловит тех, кто не записался на повторную процедуру',
    dental: 'пациент пропускает профилактику молча — список показывает, кто не был дольше срока',
  },
  segments: { any: 'правило вместо списка: видно, скольким можно писать по закону и согласию' },
  campaign_studio: {
    any: 'семь шагов от цели до запуска, с прогнозом до, а не после',
    retail: 'механика и порог собираются под ваш ассортимент, а не берутся из шаблона',
  },
  automations: { any: 'правило работает само и останавливается, если экономика поехала' },
  qr_loyalty: {
    any: 'карта гостя по QR: штампы и награды без пластиковых карт',
    cafe: 'штампы за визит — то, что в кофейне работает лучше скидки',
    beauty: 'карта помнит процедуры и возвращает клиента к сроку',
    dental: 'карта помнит дату последнего приёма и напоминает о профилактике вовремя',
  },
  content_studio: { any: 'посты, сторис и сценарии видео на русском и казахском — из вашего меню' },
  telegram_bot: { any: 'сводка дня владельцу и вступление гостя по QR прямо в Telegram' },
  impact_ledger: { any: 'прогноз, влияние и прирост разными строками — видно, что дало деньги' },
  margin_shield: { any: 'не даёт запустить акцию, которая опускает маржу ниже вашего порога' },
  simulator: { any: 'три сценария до запуска: осторожный, базовый, оптимистичный' },
  customer_brief: { any: 'что знать об этом госте и что предложить ему дальше' },
  signal_today: { any: 'одна проблема или возможность на сегодня, с источником' },
};

/**
 * Инструменты под профиль — не больше четырёх.
 *
 * Список из двенадцати «рекомендаций» ничем не отличается от каталога. Четыре —
 * это то, что владелец успевает прочитать, стоя за стойкой.
 */
export function recommendTools(input: {
  businessType: BusinessTypeCode;
  goal: GoalCode;
  tools: ToolCandidate[];
  limit?: number;
}): ToolSuggestion[] {
  const byCode = new Map(input.tools.map((tool) => [tool.code, tool]));
  const order = BY_GOAL[input.goal] ?? BY_GOAL.reactivate;
  const picked: ToolSuggestion[] = [];

  for (const code of order) {
    const tool = byCode.get(code);
    // Инструмента может не быть в каталоге (админ снял с публикации), и уже
    // закреплённый предлагать незачем — он на «Сегодня».
    if (!tool || tool.active) continue;
    const why = WHY[code];
    const reason = why ? (why[input.businessType] ?? why.any) : 'подходит вашему профилю';
    picked.push({ ...tool, reason });
    if (picked.length >= (input.limit ?? 4)) break;
  }

  return picked;
}

/** Одной строкой: из чего выведен подбор. */
export function profileSummary(businessType: BusinessTypeCode, goal: GoalCode): string {
  return `Подобрано ${TYPE_LABEL[businessType] ?? 'заведению'} с целью «${GOAL_LABEL[goal] ?? GOAL_LABEL.reactivate}»`;
}

const MECHANICS: Record<BusinessTypeCode, MechanicSuggestion[]> = {
  cafe: [
    { kind: '2_plus_1', title: '2+1 на кофе', reason: 'третий напиток за счёт заведения — привычная механика кофейни, себестоимость чашки известна' },
    { kind: 'gift_with_threshold', title: 'Подарок от суммы чека', reason: 'круассан при чеке от порога поднимает чек, не давая скидку деньгами' },
  ],
  beauty: [
    { kind: 'return_coupon', title: 'Купон на повторный визит', reason: 'скидка действует только на следующую запись — тем и возвращает' },
    { kind: 'bonus_points', title: 'Баллы за процедуры', reason: 'клиент салона считает визиты, а не чеки: баллы держат его в вашем кресле' },
  ],
  retail: [
    { kind: 'gift_with_threshold', title: 'Подарок от суммы покупки', reason: 'поднимает средний чек без прямой скидки на ассортимент' },
    { kind: 'return_coupon', title: 'Купон на второй визит', reason: 'возвращает покупателя в магазин, а не отдаёт его маркетплейсу' },
  ],
  service: [
    { kind: 'return_coupon', title: 'Скидка на повторное обращение', reason: 'сервис живёт повторными визитами — купон назначает срок следующему' },
    { kind: 'fixed_discount', title: 'Фиксированная скидка на услугу', reason: 'понятная сумма вместо процентов, которую легко объяснить на месте' },
  ],
  dental: [
    { kind: 'return_coupon', title: 'Напоминание о профилактике', reason: 'приём раз в полгода пациент не помнит сам — купон назначает срок и держит кресло занятым' },
    { kind: 'bonus_points', title: 'Баллы за гигиену и осмотр', reason: 'дешёвая процедура приводит пациента раньше, чем боль, и лечение обходится ему дешевле' },
  ],
};

/** Маркетинговые решения под тип заведения — те, что Студия действительно умеет. */
export function recommendMechanics(businessType: BusinessTypeCode): MechanicSuggestion[] {
  return MECHANICS[businessType] ?? MECHANICS.cafe;
}
