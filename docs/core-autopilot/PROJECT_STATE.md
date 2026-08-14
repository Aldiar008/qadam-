# PROJECT_STATE — фактическое состояние репозитория

Дата аудита: 14 августа 2026. Составлено чтением репозитория, а не PRD:
каждый путь, таблица и тест ниже проверены на месте.

Продукт нацелен на **небольшой цветочный магазин или сеть из 2–5 точек**:
короткий срок свежести делает ошибку закупки двусторонней — не хватило роз
перед праздником и закупили лишнего одинаково стоят денег.

Видимый бренд продукта — **QOR Autopilot**. Внутренние идентификаторы кода
остались прежними и в этом аудите не переименовываются: имя пакета
`qadam-growth-os`, каталог `src/server/qadam/`, компонент `QadamSignal`,
схема и префиксы таблиц. Глобальный rename не проводился сознательно —
см. PIVOT_AUDIT, раздел «Что решено не трогать».

---

## 1. Технический стек — как есть

| Слой | Что стоит | Версия из `package.json` |
|---|---|---|
| Фреймворк | Next.js App Router, Turbopack | 16.2.12 |
| UI | React 19, Tailwind 3.4, Radix UI | — |
| Движение | motion 11, framer-motion 12, gsap 3.15, lenis 1.1 | — |
| Иконки | lucide-react | 0.469 |
| Данные | Supabase JS 2.111, `@supabase/ssr` 0.12.4 | — |
| Тесты | node:test, Playwright 1.62, axe-core 4.12 | — |
| CLI | supabase 2.110 | — |

Node 24, TypeScript 5.7, ESLint 9 с `--max-warnings=0`.

## 2. Структура `src`

```
src/
├── adapters/        qadamAdapter.ts — единственный адаптер
├── ai/              contract, prompt, providers, generator, redaction,
│                    deterministic, demo-provider, content-pack
├── app/             маршруты App Router (см. раздел 3)
├── automations/     catalog.ts — каталог типов автоматизаций
├── billing/         provider.ts
├── components/      admin, app, brand, common, customers, landing,
│                    navigation, product, providers, segments, telegram,
│                    templates, ui
├── config/          site.ts — единственный источник навигации и бренда
├── connectors/      adapters.ts, contract.ts, market.ts
├── context/         AppModeContext, LanguageContext
├── domain/          25 модулей чистой логики + __tests__
├── i18n/            registry.ts
├── lib/             dictionary.ts, supabase/, security/, utils, metadata
├── mock-data/       campaigns.ts, customers.ts, signals.ts
├── server/          qadam/ (25 файлов), ai/, domain/, execution/, telegram/
├── services/        qadamService.ts — не импортируется нигде (мёртвый код)
└── types/           database.generated.ts и прикладные типы
```

Всего 296 файлов `.ts`/`.tsx` в `src`.

## 3. Маршруты — фактический список

### Публичная витрина (после пивота витрины)
`/`, `/platform`, `/pricing`, `/about`, `/contact`, `/demo`, `/privacy`,
`/terms`, `/login`, `/signup`, `/forgot-password`, `/reset-password`,
`/onboarding`, `/today`

`/features` + 9 подстраниц: `decision-contract`, `stockout-clock`,
`local-pulse`, `supplier-compare`, `split-order`, `messenger-stock`,
`community-trust`, `what-if`, `impact-ledger`

`/solutions` + 4 подстраницы: `cafe`, `retail`, `bakery`, `pharmacy`

### Кабинет `/app/*`
Ядро снабжения, работает на живых данных (14.08): **`inventory`** — остатки,
политика и ввод движений; **`decisions`** — очередь того, что требует решения
сегодня.

Остальные, работающие с данными: `today`, `supply`, `tools`, `analytics`,
`journal`, `notifications`, `settings`, `plan`, `team`, `team/accept`,
`recommendations`, `inbox`, `automations`, `campaigns` (+`new`, `studio`,
`[id]`), `content`, `customers` (+`[id]`), `segments`, `loyalty`

Каркасы без логики (компонент `PlannedSection`): `forecast`, `suppliers`,
`orders`, `receiving`, `impact`, `messenger-stock`, `reorder-rules`

### Админка `/admin/*`
Работающие: `/admin`, `tools`, `templates`, `categories`, `analytics`
Каркасы: `rules`, `business-types`

### Прочее
`/nearby`, `/nearby/[slug]`, `/q/[token]`, `/customers`, `/customers/import`,
`/customers/[id]`, Telegram Mini App `/tg/*` (8 маршрутов), API `/api/*`
(content/export, customers/export, domain/growth-contracts/*, jobs/run-cycle,
telegram/webhook, tg/*, webhooks/delivery)

## 4. База данных

**79 таблиц, 64 миграции**, все forward-only. Проверено `check:data-layer`.

Четыре таблицы ядра снабжения добавлены 14 августа — см. раздел ниже.

### Группы таблиц

| Группа | Таблицы | Судьба при пивоте |
|---|---|---|
| Тенант и доступ | `businesses`, `business_members`, `business_locations`, `business_profiles`, `business_types`, `business_goals`, `business_limits`, `business_tools`, `profiles`, `team_invitations` | переиспользуется целиком |
| Снабжение (есть уже) | `supply_items`, `supply_offers`, `supply_search_runs`, `market_salary_snapshots` | ядро, расширяется |
| Продажи | `transactions`, `transaction_items`, `catalog_items`, `daily_analytics` | источник истории для прогноза |
| Каталог инструментов | `tools`, `tool_categories`, `favorite_tools`, `templates`, `template_versions` | переиспользуется, меняется содержимое |
| Решения и сигналы | `recommendations`, `signals`, `growth_contracts`, `forecast_runs` | каркас под Decision Contract |
| Учёт и уведомления | `activity_logs`, `admin_audit_log`, `notifications`, `notification_preferences`, `platform_events`, `outbox_events` | переиспользуется целиком |
| Автоматизации | `automations`, `automation_runs`, `business_execution_state` | каркас под правила автозаказа |
| Тарифы | `plans`, `plan_entitlements`, `entitlements`, `subscriptions`, `billing_events`, `usage_counters` | переиспользуется |
| Эффект | `impact_baselines`, `impact_measurements` | переиспользуется |
| Маркетинг (legacy) | `campaigns`, `campaign_*` (4), `content_items`, `content_refresh_state`, `customers`, `customer_*` (5), `customer_segments`, `segment_memberships`, `loyalty_*` (3), `rewards`, `reward_redemptions`, `redemptions`, `promotions`, `qr_codes`, `qr_scans`, `nearby_offers`, `nearby_offer_events`, `brand_memory`, `suppression_entries`, `tracking_codes` | остаётся в базе, уходит из потока |
| Инфраструктура | `ai_generation_runs`, `ai_usage_quota`, `data_imports`, `data_import_errors`, `data_inventory`, `retention_policies`, `privacy_requests`, `customer_consents`, `source_connections`, `provider_events`, `feature_flags`, `capacity_slots`, `operating_hours`, `inquiry_policies`, `onboarding_sessions`, `private` | переиспользуется |

### Ключевые инварианты, которые нельзя нарушить

- Разделение режимов: констрейнт `(mode='demo' and is_mock) or (mode='production' and not is_mock)` плюс триггер, запрещающий mock-строки в боевом заведении.
- Row Level Security на всех тенантных таблицах; роль платформенного администратора живёт в приватной таблице назначений.
- У каждой тенантной таблицы есть `business_id` и `is_mock`.
- `supabase/seed.sql` — только синтетика и только локально; CI это проверяет, deploy его не применяет.

### Существующая схема снабжения

`supply_items`: `business_id`, `name_ru`, `unit`, `current_price_minor`,
`current_supplier`, `monthly_quantity`, `needed`, `notes`, `is_mock`,
уникальность `(business_id, name_ru)`.

`supply_offers`: `business_id`, `supply_item_id`, `supplier`, `price_minor`,
`pack_size`, `url`, `source`, `verified`, `found_at`.

`supply_search_runs`: история попыток поиска цен с `status` и `offers_found`.

RPC `supply_savings(p_business_id)` считает экономию по позициям.

### Ядро снабжения — реализовано 14 августа

Миграции `20260814090000_stock_is_a_trail_of_events` и
`20260814091000_the_last_unindexed_foreign_key`. Подробности схемы — в
[DATA_MODEL](../qadam/DATA_MODEL.md), раздел «Ядро снабжения».

- `supply_items` расширена политикой пополнения: категория, упаковка,
  минимальная партия, срок годности, минимальный остаток, срок поставки p80,
  уровень сервиса.
- `inventory_events` — append-only журнал движений с ключом идемпотентности.
- `inventory_balances` — сумма журнала; пишет только функция.
- `demand_forecasts` — снимок прогноза с версией формулы, WAPE и допущениями.
- `supply_risks` — открытый риск по позиции с доказательствами.
- Функции `record_inventory_event` и `daily_demand`.

### Цветочное ядро — 14 августа, миграция `20260814120000_flowers_do_not_wait`

- `inventory_lots` — партии с датой прихода и сроком свежести; расход разбирает
  их в порядке истечения.
- `demand_events` — календарь праздников: общий платформенный и свой у магазина.
- `inventory_events` + `waste_reason`, `expires_at`; списание отделено от продажи.
- `supply_items` + `criticality`, `spoilage_tolerance_bps`.
- `supply_risks` + количество и стоимость под списанием, ближайший срок.

Демо-магазин **TAMYR Flowers**: восемь позиций (розы, тюльпаны, хризантемы,
пионы, гипсофила, эвкалипт, упаковка, лента), 309 событий за 28 дней — продажи,
поставки и списания. Остатки подобраны так, что очередь показывает обе беды
сразу: розы и эвкалипт закончатся раньше поставки, тюльпаны и пионы не успеют
продаться до потери свежести.

Чего в схеме **по-прежнему нет** и что придётся создавать: заказы поставщикам и
их позиции, приёмка и расхождения, надёжность поставщика, календарь событий и
коэффициенты, входящие сообщения мессенджера.

## 5. Доменный слой

25 модулей в `src/domain`. Самые ценные для пивота:

| Модуль | Что даёт |
|---|---|
| `shared.ts` | `explanation()` — обязательные source, formula, confidence, assumptions, period у каждого производного числа |
| `state-machines.ts` | конечные автоматы с идемпотентностью и оптимистической блокировкой |
| `impact-ledger.ts` | разделение forecast / influenced / verified, запрет выдавать mock за факт |
| `analytics-charts.ts` | построение графиков |
| `simulator.ts` | сценарный расчёт |
| `tool-recommendations.ts` | подбор инструментов по профилю бизнеса |
| `activity-log.ts` | чтение и группировка журнала |
| `signals.ts` | сравнение сопоставимых окон, без причинных утверждений |
| `pricing.ts` | публичный прайс-лист, сверяется с миграцией тестом |

## 6. Тесты — что есть и что реально прошло сегодня

| Набор | Команда | Статус на 14.08 |
|---|---|---|
| Доменные unit | `npm test` | **295 пройдено, 0 упало** |
| Линт | `npm run lint` | **чисто**, 0 предупреждений |
| Типы | `npm run typecheck` | **чисто** |
| Сборка | `npm run build` | **успешно**, все маршруты собраны |
| Вложенные формы | `npm run check:markup` | **пройдено** |
| Секреты в клиенте | `npm run check:secrets` | **пройдено** |
| Слой данных | `npm run check:data-layer` | **пройдено**: 79 таблиц, 61 миграция |
| Дрейф типов | `npm run check:types-drift` | **пройдено**: типы синхронны со схемой |
| pgTAP, 14 файлов | `npm run db:test` | **244 проверки, 4 падения** — все в `008_ai_generation_governance`, предсуществующий дрейф текста ошибки |
| E2E Playwright, 6 наборов | `npm run test:e2e` | набор `supply` — **32 из 32**; остальные не прогонялись на этом шаге |
| Безопасность (RLS-матрица, HTTP) | `npm run test:security` | **не проверено** — требует Docker |
| Доступность axe-core | `npm run test:a11y` | **не проверено** — требует Docker |
| Производительность | `npm run test:perf` | **не проверено** — требует Docker |
| Разделение режимов | `npm run test:modes` | **не проверено** — требует Docker |
| Релизный аудит | `npm run test:release` | **не проверено** — требует Docker |

Docker Desktop запущен 14 августа, локальный Supabase поднят. Блокер снят.

## 7. Незакоммиченные изменения

81 файл изменён относительно `b11a648`, ничего не закоммичено. Это правки
пивота витрины, сделанные 14 августа: тексты лендинга, переименование
маршрутов `/features/*` и `/solutions/*`, навигация, метаданные, каркасы
новых разделов кабинета. Функционал и база не затрагивались.

## 8. Что запускается прямо сейчас

`npm run dev` поднимает витрину полностью: главная и все публичные страницы
отвечают 200 без базы. Кабинет и админка требуют Supabase, то есть Docker.

Полный стенд поднимается одной командой `npm run dev:all` — она проверяет
Docker, поднимает Supabase, синхронизирует `.env.local`, сверяет миграции и
запускает цикл выполнения раз в минуту.

## 9. Целевая карта экранов

Вынесена в отдельный файл: [SCREEN_MAP.md](SCREEN_MAP.md).

## 10. Риски миграции

| Риск | Почему реален | Что делать |
|---|---|---|
| Удаление маркетинговых таблиц уронит pgTAP и E2E | 12 файлов pgTAP и 5 сценариев Playwright опираются на кампании, лояльность и сегменты | не удалять; выводить из потока, а не из базы |
| Экран `/app/today` — единственный вход в кабинет с живыми данными | заменить его заглушкой значит оставить кабинет без демонстрируемого экрана | переделывать содержимым, а не удалением |
| `supply_items` без событийного остатка | текущая таблица хранит только текущую цену, не движение | новая таблица событий, `supply_items` остаётся как справочник цен |
| Seed привязан к типам бизнеса `cafe/beauty/retail/service` | смена кодов сломает `002_seed_counts` | добавлять новые типы, а не переименовывать существующие |
| `check:types-drift` требует базы | после новых миграций типы придётся перегенерировать | `npm run db:types:write` при поднятом Supabase |
| Дедлайн финала — 15 августа | времени на полный цикл нет | резать можно всё, кроме связки остаток → риск → решение → заказ → приёмка |

## 11. Файлы, которые нельзя менять без отдельного решения

- `supabase/migrations/*` — только добавление новых файлов, ничего не править и не удалять.
- `supabase/seed.sql` и `supabase/seed/*` — привязаны к pgTAP-счётчикам.
- `src/lib/supabase/*`, `src/server/qadam/repository.ts`, `src/server/qadam/rbac.ts` — контекст тенанта и роли.
- `src/proxy.ts` и middleware — сессии.
- `src/domain/shared.ts`, `state-machines.ts` — на них стоят доменные тесты.
- `src/types/database.generated.ts` — генерируется, руками не править.
