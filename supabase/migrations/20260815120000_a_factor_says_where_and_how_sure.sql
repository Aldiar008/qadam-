begin;

-- Повод спроса обязан сказать, где он действует и насколько ему верят.
--
-- Восьмое марта в Алматы и в райцентре — разные всплески, а «×1,8» без указания
-- уверенности читается как измерение, хотя это предположение из отраслевого
-- шаблона. Оба поля были у прогноза и у риска с самого начала; у календаря их
-- не оказалось, и он единственный подавал число без родословной.

alter table public.demand_events
  add column if not exists region text not null default 'Алматы',
  -- Насколько мы верим этому коэффициенту, миллионные. Шаблон отраслевой —
  -- уверенность низкая; измеренный по прошлому году факт — высокая.
  add column if not exists confidence_ppm integer not null default 400000
    check (confidence_ppm between 0 and 1000000);

comment on column public.demand_events.region is
 'Где действует повод: всплеск на 8 марта в Алматы и в райцентре разный.';
comment on column public.demand_events.confidence_ppm is
 'Насколько верим коэффициенту. Отраслевой шаблон — низкая, измеренный факт — высокая.';

-- Уверенность подтянута к происхождению: у проверенного фактом повода она
-- высокая, у шаблонного — та, с которой такие лифты и стоит применять.
update public.demand_events
set confidence_ppm = case when verified then 800000 else 400000 end;

create index if not exists demand_events_region_idx on public.demand_events(region, event_date);

commit;
