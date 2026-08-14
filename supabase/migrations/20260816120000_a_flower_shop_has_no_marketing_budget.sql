begin;

-- У цветочного магазина нет месячного маркетингового бюджета.
--
-- Колонка `business_limits.monthly_budget_minor` осталась от продукта, который
-- продавал кампании: там бюджет был обязателен, потому что без него нельзя было
-- посчитать, влезает ли акция. Цветочный магазин про акции не спрашивают, и
-- регистрация падала на этом NOT NULL — анкета проходила пять шагов и умирала
-- на шестом с ошибкой, которую владельцу нечем объяснить.
--
-- Число сюда можно было бы подставить. Но подставленный бюджет неотличим от
-- заданного, а решение, принятое по выдуманному ограничению, — это ровно тот
-- случай, ради которого весь продукт хранит рядом с каждой цифрой её источник.
-- Пусто честнее: экран настроек уже показывает «не задан» и умеет это состояние.

alter table public.business_limits
  alter column monthly_budget_minor drop not null;

comment on column public.business_limits.monthly_budget_minor is
 'Месячный бюджет. Пусто означает «не задан» — так у заведений, которых про бюджет не спрашивали, а не ноль.';

-- Ограничение остаётся: заданный бюджет не может быть отрицательным. Проверка
-- пропускает null, потому что в SQL сравнение с ним даёт неизвестность, а не
-- ложь, — и строка без бюджета проходит.
alter table public.business_limits
  drop constraint if exists business_limits_monthly_budget_minor_check;
alter table public.business_limits
  add constraint business_limits_monthly_budget_minor_check
  check (monthly_budget_minor is null or monthly_budget_minor >= 0);

commit;
