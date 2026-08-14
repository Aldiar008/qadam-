export const siteConfig = {
  name: 'QOR Autopilot',
  shortDescription: 'Автопилот снабжения для цветочного магазина',
  description: 'Автопилот снабжения для цветочного магазина: свежесть партий, прогноз спроса к празднику, разделённый заказ и контроль поставщиков за одно подтверждение.',
  url: 'https://qadam.app',
  ogImage: '/images/og-image.jpg',
  mainNav: [
    { titleRu: 'Платформа', titleKk: 'Платформа', href: '/platform' },
    { titleRu: 'Возможности', titleKk: 'Мүмкіндіктер', href: '/features' },
    { titleRu: 'Для бизнеса', titleKk: 'Бизнес үшін', href: '/solutions' },
    { titleRu: 'Тарифы', titleKk: 'Тарифтер', href: '/pricing' },
    { titleRu: 'О нас', titleKk: 'Біз туралы', href: '/about' },
  ],
  subnavLanding: [
    { titleRu: 'Обзор', titleKk: 'Шолу', href: '#overview' },
    { titleRu: 'Как работает', titleKk: 'Қалай жұмыс істейді', href: '#how-it-works' },
    { titleRu: 'Свежесть', titleKk: 'Сергектік', href: '#features' },
    { titleRu: 'Разделить заказ', titleKk: 'Тапсырысты бөлу', href: '#margin-shield' },
    { titleRu: 'Результат', titleKk: 'Нәтиже', href: '#impact' },
  ],
  /**
   * Меню владельца цветочного магазина.
   *
   * Семь пунктов, и они повторяют его день, а не устройство продукта: что
   * происходит сегодня → что на витрине → что решить → что заказано → у кого
   * покупаем → что ещё умеет продукт → администрирование.
   *
   * Восемнадцать плоских пунктов, которые были здесь раньше, — это оглавление
   * базы данных. Владелец за стойкой не ищет «Цены поставщиков» отдельно от
   * «Поставщиков»: он открывает поставщиков и там смотрит цены. Поэтому всё,
   * что подчинено разделу, теперь лежит внутри него, а не рядом.
   */
  appNav: [
    { titleRu: 'Сегодня', titleKk: 'Бүгін', href: '/app/today', icon: 'Sparkles' },
    {
      titleRu: 'Цветы и остатки', titleKk: 'Гүлдер мен қалдықтар', href: '/app/inventory', icon: 'Flower2',
      children: [
        { titleRu: 'Прогноз спроса', titleKk: 'Сұраныс болжамы', href: '/app/forecast', icon: 'TrendingUp' },
        { titleRu: 'Остатки из чата', titleKk: 'Чаттан қалдықтар', href: '/app/messenger-stock', icon: 'MessagesSquare' },
      ],
    },
    {
      titleRu: 'Решения', titleKk: 'Шешімдер', href: '/app/decisions', icon: 'FileCheck',
      children: [
        { titleRu: 'Правила автозаказа', titleKk: 'Автотапсырыс ережелері', href: '/app/reorder-rules', icon: 'Sliders' },
      ],
    },
    {
      titleRu: 'Заказы', titleKk: 'Тапсырыстар', href: '/app/orders', icon: 'ClipboardList',
      children: [
        { titleRu: 'Приёмка', titleKk: 'Қабылдау', href: '/app/receiving', icon: 'PackageCheck' },
      ],
    },
    {
      titleRu: 'Поставщики', titleKk: 'Жеткізушілер', href: '/app/suppliers', icon: 'Truck',
      children: [
        { titleRu: 'Цены поставщиков', titleKk: 'Жеткізуші бағалары', href: '/app/supply', icon: 'PackageSearch' },
      ],
    },
    { titleRu: 'Инструменты', titleKk: 'Құралдар', href: '/app/tools', icon: 'Wrench' },
  ],
  /**
   * Сервисные разделы.
   *
   * Они нужны, но не каждый день, и потому не соревнуются за внимание с очередью
   * решений. Убрать их совсем означало бы спрятать настройки и историю — а это
   * не упрощение, а потеря.
   */
  appServiceNav: [
    { titleRu: 'Аналитика', titleKk: 'Аналитика', href: '/app/analytics', icon: 'BarChart3' },
    { titleRu: 'Эффект', titleKk: 'Әсер', href: '/app/impact', icon: 'Scale' },
    { titleRu: 'Уведомления', titleKk: 'Хабарламалар', href: '/app/notifications', icon: 'Bell' },
    { titleRu: 'История действий', titleKk: 'Әрекеттер тарихы', href: '/app/journal', icon: 'History' },
    { titleRu: 'Команда', titleKk: 'Команда', href: '/app/team', icon: 'Users' },
    { titleRu: 'Тариф', titleKk: 'Тариф', href: '/app/plan', icon: 'CreditCard' },
    { titleRu: 'Настройки', titleKk: 'Баптаулар', href: '/app/settings', icon: 'Settings' },
  ],
  adminNav: [
    { titleRu: 'Обзор', titleKk: 'Шолу', href: '/admin', icon: 'LayoutDashboard' },
    { titleRu: 'Категории цветов', titleKk: 'Гүл санаттары', href: '/admin/flower-categories', icon: 'Flower2' },
    { titleRu: 'Товарная политика', titleKk: 'Тауар саясаты', href: '/admin/policies', icon: 'Timer' },
    { titleRu: 'Правила автозаказа', titleKk: 'Автотапсырыс ережелері', href: '/admin/rules', icon: 'Workflow' },
    { titleRu: 'Календарь поводов', titleKk: 'Себептер күнтізбесі', href: '/admin/calendar', icon: 'CalendarDays' },
    { titleRu: 'Шаблоны поставщиков', titleKk: 'Жеткізуші үлгілері', href: '/admin/templates', icon: 'FileText' },
    { titleRu: 'Инструменты', titleKk: 'Құралдар', href: '/admin/tools', icon: 'Sliders' },
    { titleRu: 'Наборы инструментов', titleKk: 'Құрал жинақтары', href: '/admin/bundles', icon: 'Layers' },
    { titleRu: 'Категории каталога', titleKk: 'Каталог санаттары', href: '/admin/categories', icon: 'FolderTree' },
    { titleRu: 'Типы бизнеса', titleKk: 'Бизнес түрлері', href: '/admin/business-types', icon: 'Store' },
    { titleRu: 'Аналитика', titleKk: 'Аналитика', href: '/admin/analytics', icon: 'TrendingUp' },
  ]
};
