begin;

-- Two things the content library could not say about itself.
--
-- **Order.** The pack composes three Stories with distinct jobs — hook, offer,
-- action — and numbers them. That number was dropped on insert, so in the
-- cabinet the three were indistinguishable and arrived in whatever order the
-- query happened to return. `ordinal` keeps it.
--
-- **Origin.** Every asset looked alike whether a model wrote it or the built-in
-- template did. Provenance is the difference between «AI написал» and «мы
-- собрали из шаблона», and this product does not let those two look the same.
alter table public.content_items add column if not exists ordinal integer not null default 1 check (ordinal > 0);
alter table public.content_items add column if not exists source text not null default 'template'
  check (source in ('template', 'provider'));
alter table public.content_items add column if not exists generation_run_id uuid
  references public.ai_generation_runs(id) on delete set null;

comment on column public.content_items.ordinal is
 'Position within its kind and locale, so three Stories keep the order they were written in.';
comment on column public.content_items.source is
 'Whether a model produced this asset or the deterministic template did. Shown to the owner, never guessed.';

-- A foreign key without an index is a sequential scan waiting to happen, and
-- this repository already had that lesson once.
create index if not exists content_items_generation_run_idx on public.content_items(generation_run_id)
  where generation_run_id is not null;

commit;
