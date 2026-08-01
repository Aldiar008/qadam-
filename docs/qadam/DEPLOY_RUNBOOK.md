# DEPLOY RUNBOOK — QADAM Growth OS

Пошаговый порядок развёртывания. **Ничего из этого ещё не выполнялось:** удалённого проекта
Supabase не существует, хостинг не подключён, разрешения на деплой не давалось.

Документ написан так, чтобы его можно было выполнить буквально, а не «по смыслу».

> **Правило.** Ни один шаг не выполняется без явного указания владельца продукта и точного
> имени цели. «Задеплой» — недостаточная команда. Достаточная: «задеплой на staging проекта
> `abcdefgh`».

---

## Часть A. Подготовка (выполняется один раз)

### A1. Создать проекты

Два **отдельных** проекта Supabase: `qadam-staging` и `qadam-production`. Один проект на два
окружения — это одна база на синтетические и реальные данные, чего делать нельзя.

Записать для каждого: project ref, регион, пароль базы.

### A2. Завести GitHub Environments

`staging` и `production`, у каждого свои секреты:

| Секрет | Откуда |
|---|---|
| `SUPABASE_PROJECT_REF` | Settings → General проекта |
| `SUPABASE_ACCESS_TOKEN` | личный токен аккаунта |
| `SUPABASE_DB_PASSWORD` | пароль базы проекта |
| `CI_SUPABASE_PUBLISHABLE_KEY` | Settings → API |
| `CI_SUPABASE_SECRET_KEY` | Settings → API, **только сервер** |
| `QADAM_JOB_SECRET` | сгенерировать: `openssl rand -hex 32` |
| `QADAM_WEBHOOK_SECRET` | сгенерировать отдельно, не тот же |

На `production` включить required reviewers, чтобы деплой требовал подтверждения человеком.

### A3. Настроить окружение приложения

```
QADAM_APP_MODE=PRODUCTION_MODE
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable>
SUPABASE_SECRET_KEY=<secret, только сервер>
NEXT_PUBLIC_SITE_URL=https://<домен>
QADAM_AI_PROVIDER=none
QADAM_JOB_SECRET=<...>
QADAM_WEBHOOK_SECRET=<...>
```

`QADAM_APP_MODE=PRODUCTION_MODE` — не косметика: он убирает demo-вход, скачок во времени и
любые симуляции. Значение `DEMO_MODE` на общем окружении считается инцидентом.

### A4. Настройки базы после первого подключения

```sql
-- Короткие таймауты: каждый экран — курсорная страница или агрегат,
-- всё медленнее восьми секунд является дефектом, а не долгим запросом.
alter role authenticated set statement_timeout = '8s';
alter role authenticated set idle_in_transaction_session_timeout = '15s';
```

Приложение подключается через pooler (`:6543`, transaction mode). Миграции — напрямую
(`:5432`), им нужна сессия.

---

## Часть B. Развёртывание на staging

### B1. Проверить, что цель — та самая

```bash
npx supabase projects list
npx supabase link --project-ref <STAGING_REF>
npx supabase projects api-keys --project-ref <STAGING_REF> | head -3
```

Сверить ref с тем, что записан в A1. **Если ref не совпадает — остановиться.**

### B2. Dry run миграций

Ничего не применяя, посмотреть, что именно будет применено:

```bash
npx supabase db diff --linked --schema public > /tmp/staging-diff.sql
wc -l /tmp/staging-diff.sql
npx supabase migration list --linked
```

Ожидание на пустом проекте: локальных миграций 25, применённых на сервере 0.

Проверить, что реплей проходит с нуля локально — это и есть репетиция:

```bash
npx supabase db reset --local && npm run db:test
```

### B3. Применить миграции

```bash
npx supabase db push --linked
npx supabase migration list --linked   # все 25 должны стать applied
```

**Seed не применяется.** `supabase/seed.sql` синтетический и только для локальной машины.

### B4. Проверить, что права и изоляция доехали

```bash
QADAM_DB_HOST=<staging> node tests/security/rls-matrix.mjs
```

Отдельно убедиться, что новый проект не потерял гранты (см. изменение платформы от
2026-04-28, из-за которого гранты и объявлены явно):

```sql
select grantee, privilege_type, count(*)
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated')
group by 1,2 order by 1,2;
-- ожидание: anon SELECT 5; authenticated SELECT 79, INSERT 70, UPDATE 65, DELETE 61
-- и ни одной строки TRUNCATE / TRIGGER / REFERENCES

select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
-- ожидание: 0
```

### B5. Собрать и развернуть приложение

Собрать с переменными окружения staging и развернуть у выбранного провайдера. После этого
проверить заголовки — если их нет, значит прокси не отработал:

```bash
curl -sI https://<staging>/login | grep -iE 'content-security|strict-transport|x-frame|referrer|permissions'
# script-src обязан содержать 'nonce-…'
```

### B6. Smoke и E2E против staging

```bash
QADAM_E2E_BASE=https://<staging> npm run test:e2e
QADAM_E2E_BASE=https://<staging> node tests/security/http-suite.mjs
QADAM_E2E_BASE=https://<staging> node tests/release/mode-separation.mjs
```

Ограничение, о котором нужно знать заранее: наборы, читающие базу через
`docker exec ... psql`, на staging работать не будут — им нужен прямой доступ. Либо задать
`QADAM_DB_CONTAINER` на туннель, либо запускать только те проверки, что ходят по HTTP.

Ручная проверка на staging, которую не заменяет автоматика:

- зарегистрировать тестовое заведение и пройти онбординг;
- убедиться, что кнопки demo-входа **нет**;
- убедиться, что скачка во времени **нет**;
- убедиться, что канал показан как не подключённый, а не как готовый;
- попробовать запустить кампанию — запуск должен быть отклонён с честным объяснением;
- открыть `/admin` обычным владельцем — должен быть отбит.

### B7. Проверить логи

```bash
npx supabase logs --linked --level error   # окно наблюдения: первые 30 минут
```

Смотреть на: `permission denied for table` (значит, гранты не доехали), `row-level security`
(значит, политика не та), 500 на маршрутах кабинета (значит, граница ошибок ловит что-то
настоящее). Плюс:

```sql
select status, count(*) from public.outbox_events group by 1;
select calls, round(mean_exec_time::numeric,2) ms, left(query,100)
from pg_stat_statements order by mean_exec_time desc limit 10;
```

### B8. Зафиксировать откат

**До** объявления staging рабочим записать в журнал релиза:

| Что | Значение |
|---|---|
| Предыдущая сборка (id для отката) | |
| Последняя применённая миграция | |
| Время первого дымового прогона | |
| Кто выполнял | |

Откат кода — развернуть предыдущую сборку; схему это не трогает.
Откат схемы — **только новой миграцией**, отменяющей предыдущую. `supabase migration repair`
применяется, лишь если история на сервере разошлась с репозиторием, и всегда с записью.

---

## Часть C. Production

**Не выполнять без явного разрешения владельца продукта и точного ref проекта.**

Предусловия, каждое обязательно:

1. Staging развёрнут, прошёл B4–B7 и проработал под наблюдением не менее суток.
2. Тренировка восстановления из бэкапа **выполнена на staging** (см. RUNBOOK) — сейчас она
   написана, но ни разу не проходилась.
3. Юридическая проверка для Казахстана выполнена, либо запуск ограничен пилотом с явным
   согласием участников.
4. Тексты на казахском проверены носителем, либо интерфейс честно ограничен русским.
5. Платёжный провайдер либо подключён и проверен в sandbox, либо тарифы отключены — не
   существует состояния «оплата почти работает».
6. Rate limit и защита от повтора перенесены в общий стор, если инстансов больше одного.

Порядок тот же, что B1–B8, с тремя отличиями:

- `production` окружение требует подтверждения ревьюера;
- перед `db push` — свежий снимок базы и запись его идентификатора;
- окно наблюдения после релиза — не 30 минут, а сутки, с проверкой аудита:

```sql
select occurred_at, actor_role, action, resource_code, reason
from public.admin_audit_log where occurred_at > now() - interval '1 day' order by 1 desc;
```

---

## Часть D. Чего делать нельзя

| Никогда | Почему |
|---|---|
| Применять `supabase/seed.sql` вне локальной машины | Смешает синтетические строки с реальными арендаторами и разрушит все гарантии честности |
| Применять любой seed на проекте, не помеченном как демонстрационный | См. часть E: метку ставит человек, и продакшн её не получает |
| Ставить `QADAM_APP_MODE=DEMO_MODE` на общем окружении | Вернёт demo-вход и скачок во времени в среду с реальными данными |
| Класть `SUPABASE_SECRET_KEY` в переменную с префиксом `NEXT_PUBLIC_` | Отправит серверный ключ в браузер; `npm run check:secrets` для этого и существует |
| Восстанавливать бэкап поверх работающей базы | Вернёт данные, удалённые по законному запросу |
| Деплоить при упавшем CI | `deploy.yml` этого не позволит — не обходите его вручную |
| Отмечать канал `connected` без пройденной проверки связи | База откажет, и это правильно |

---

## Часть E. Демонстрационное окружение

Судьям и инвесторам нужен работающий продукт по ссылке, а не пустая база с формой
регистрации. Это отдельное, **третье** окружение — не staging и не production.

Правила, которые оно не нарушает:

1. **Свой проект Supabase.** Демо-данные никогда не живут в одной базе с реальными
   арендаторами. Демо-проект и production-проект — разные ref.
2. **Guard не удаляется, а перенаправляется.** `supabase/seed.sql` отказывается работать вне
   локальной машины, и так и остаётся. Для удалённой демо-базы генерируется
   `supabase/seed/remote_demo_seed.sql` (`npm run seed:remote`), который отказывается работать
   на любой базе без явной метки, поставленной человеком:

   ```sql
   -- выполняется один раз и только на демо-проекте
   alter database postgres set app.settings.qadam_demo_database = 'true';
   ```

   Production-проект метки не получает, поэтому seed на нём не пройдёт — весь файл идёт одной
   транзакцией, и отказ означает exception, а не половину вставленных строк.
3. **`QADAM_APP_MODE=DEMO_MODE` допустим только здесь.** На staging и production это по-прежнему
   инцидент (часть D). Каждая строка demo-seed помечена `is_mock`, и база не даёт назвать её
   проверенным фактом — именно этот инвариант делает демо честным.
4. **Демо-логины существуют.** Пароль общий, аккаунты синтетические, домен `@qadam.local`
   не резолвится — они не пересекаются ни с одним реальным пользователем.

Порядок: B1–B3 без изменений (миграции те же), затем метка из пункта 2, затем seed, затем
приложение с `QADAM_APP_MODE=DEMO_MODE` и `NEXT_PUBLIC_SITE_URL` демо-домена.
