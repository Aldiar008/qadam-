/**
 * Публичный прайс-лист — один на витрину и на базу.
 *
 * Цены раньше были написаны прямо в разметке `/pricing` и разошлись с таблицей
 * `public.plans`, по которой сервер считает лимиты. Здесь они лежат один раз;
 * миграция `20260804070000_the_price_list_matches_the_offer.sql` записывает
 * ровно эти же числа в базу, а модульный тест сверяет одно с другим.
 *
 * `priceMinor` — целые тенге: так их хранит `plans.price_minor` и так их
 * форматирует кабинет.
 */
export type PublicPlanCode = 'standard' | 'growth' | 'pro';

export type PublicPlan = {
  code: PublicPlanCode;
  name: string;
  priceMinor: number;
  currency: 'KZT';
  popular: boolean;
  descRu: string;
  descKk: string;
  featuresRu: string[];
  featuresKk: string[];
  ctaRu: string;
  ctaKk: string;
};

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    code: 'standard',
    name: 'Standard',
    priceMinor: 9900,
    currency: 'KZT',
    popular: false,
    descRu: 'Для одной точки, которая уже работает с постоянными гостями.',
    descKk: 'Тұрақты қонақтармен жұмыс істейтін бір нүктеге.',
    featuresRu: [
      'До 500 клиентов в базе',
      'Экран «Сегодня»: сигнал дня и готовое действие',
      'Margin Shield — фильтр убыточных акций',
      'QR-лояльность и карточка клиента',
      'Контент на русском и казахском',
    ],
    featuresKk: [
      'Базада 500-ге дейін клиент',
      '«Бүгін» экраны: күн сигналы және дайын әрекет',
      'Margin Shield — шығынды акциялар сүзгісі',
      'QR-адалдық және клиент картасы',
      'Орыс және қазақ тіліндегі контент',
    ],
    ctaRu: 'Начать 14 дней бесплатно',
    ctaKk: '14 күн тегін бастау',
  },
  {
    code: 'growth',
    name: 'Growth',
    priceMinor: 59900,
    currency: 'KZT',
    popular: true,
    descRu: 'Для растущего бизнеса: несколько каналов, команда и автоматизации.',
    descKk: 'Өсіп келе жатқан бизнеске: бірнеше арна, команда және автоматтандыру.',
    featuresRu: [
      'База клиентов без ограничения',
      'Growth Contract без лимита',
      'Контент-студия и публикация в каналы',
      'Impact Ledger: влияние и прирост раздельно',
      'Автоматизации и Telegram Mini App',
    ],
    featuresKk: [
      'Шектеусіз клиенттер базасы',
      'Шектеусіз Growth Contract',
      'Контент студиясы және арналарға жариялау',
      'Impact Ledger: әсер мен өсім бөлек',
      'Автоматтандыру және Telegram Mini App',
    ],
    ctaRu: 'Выбрать тариф Growth',
    ctaKk: 'Growth тарифін таңдау',
  },
  {
    code: 'pro',
    name: 'Pro',
    priceMinor: 99000,
    currency: 'KZT',
    popular: false,
    descRu: 'Для сети точек с большой базой и полным набором автоматизаций.',
    descKk: 'Үлкен базасы және толық автоматтандыруы бар нүктелер желісіне.',
    featuresRu: [
      'До 5 точек в одном кабинете',
      'Сравнение точек между собой',
      'Общие акции на несколько точек',
      'Приоритетная поддержка и разбор данных',
      'Индивидуальные интеграции с кассой',
    ],
    featuresKk: [
      'Бір кабинетте 5 нүктеге дейін',
      'Нүктелерді өзара салыстыру',
      'Бірнеше нүктеге ортақ акциялар',
      'Басым қолдау және деректерді талдау',
      'Кассамен жеке интеграциялар',
    ],
    ctaRu: 'Связаться с нами',
    ctaKk: 'Бізбен байланысу',
  },
];

export function formatTenge(amount: number) {
  return `${new Intl.NumberFormat('ru-RU').format(amount)} ₸`;
}
