begin;

-- «Закончились стаканы — где взять дешевле».
--
-- Every other number in this product is derived from the venue's own data. A
-- procurement module is where that discipline is easiest to break: it would be
-- trivial to have a model «find» a price and print it, and a café owner would
-- order against it. So the shape here is deliberate — an offer is a row somebody
-- can point at, with a source, a date and, where it came from the web, a link
-- the owner is expected to open before ordering.

create table if not exists public.supply_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name_ru text not null check (char_length(name_ru) between 2 and 200),
  unit text not null default 'шт' check (char_length(unit) between 1 and 20),
  -- What the venue pays today, per unit. Null means «не знаю», which is a
  -- normal state and shown as such rather than as zero.
  current_price_minor bigint check (current_price_minor is null or current_price_minor >= 0),
  current_supplier text,
  monthly_quantity integer check (monthly_quantity is null or monthly_quantity >= 0),
  /** Set when the owner says it ran out; the list is sorted by this first. */
  needed boolean not null default false,
  notes text,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, name_ru)
);

create table if not exists public.supply_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete cascade,
  supplier text not null check (char_length(supplier) between 2 and 200),
  price_minor bigint not null check (price_minor >= 0),
  pack_size integer not null default 1 check (pack_size > 0),
  url text,
  -- Where this came from, never guessed. `owner` typed it, `import` came from a
  -- price list, `web` was found online and still needs a human to open the link.
  source text not null default 'owner' check (source in ('owner', 'import', 'web')),
  found_at timestamptz not null default now(),
  /** True only once a person confirmed the price by opening the link or calling. */
  verified boolean not null default false,
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.supply_items enable row level security;
alter table public.supply_offers enable row level security;

create policy supply_items_member_all on public.supply_items
  for all to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = supply_items.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (select 1 from public.business_members bm where bm.business_id = supply_items.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner','manager','marketer')));

create policy supply_offers_member_all on public.supply_offers
  for all to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = supply_offers.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (select 1 from public.business_members bm where bm.business_id = supply_offers.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner','manager','marketer')));

grant select, insert, update, delete on public.supply_items to authenticated;
grant select, insert, update, delete on public.supply_offers to authenticated;
grant select, insert, update, delete on public.supply_items to service_role;
grant select, insert, update, delete on public.supply_offers to service_role;

create index if not exists supply_items_business_idx on public.supply_items(business_id, needed desc, name_ru);
create index if not exists supply_offers_item_idx on public.supply_offers(supply_item_id, price_minor);
create index if not exists supply_offers_business_idx on public.supply_offers(business_id);

comment on table public.supply_items is
 'What the venue buys, what it pays now and whether it has run out. The baseline every saving is measured against.';
comment on table public.supply_offers is
 'Prices found for a supply item. `source` says who found it; `verified` says whether a person has actually confirmed it.';

/**
 * Экономия по каждой позиции: что платим сейчас против лучшего предложения.
 *
 * Per unit, because a cheaper pack of a different size is not a cheaper price —
 * that is the trick every price list plays. Where the venue does not know what
 * it pays today, the saving is `null` rather than «весь товар бесплатно».
 */
create or replace function private.supply_savings(p_business_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(row order by (row->>'needed')::boolean desc, (row->>'savingMinor')::bigint desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', i.id,
      'name', i.name_ru,
      'unit', i.unit,
      'needed', i.needed,
      'monthlyQuantity', i.monthly_quantity,
      'currentPriceMinor', i.current_price_minor,
      'currentSupplier', i.current_supplier,
      'best', case when b.id is null then null else jsonb_build_object(
        'id', b.id, 'supplier', b.supplier, 'unitPriceMinor', b.unit_price,
        'packSize', b.pack_size, 'url', b.url, 'source', b.source,
        'verified', b.verified, 'foundAt', b.found_at) end,
      'offerCount', coalesce(c.total, 0),
      -- Saving per unit, and per month when the volume is known. Null when the
      -- venue has not said what it pays — an unknown baseline cannot produce a
      -- number, and printing one would be the whole problem with this feature.
      'savingMinor', case when i.current_price_minor is null or b.unit_price is null then null
                          else greatest(0, i.current_price_minor - b.unit_price) end,
      'monthlySavingMinor', case when i.current_price_minor is null or b.unit_price is null or i.monthly_quantity is null then null
                                 else greatest(0, i.current_price_minor - b.unit_price) * i.monthly_quantity end) as row
    from public.supply_items i
    left join lateral (
      select o.id, o.supplier, o.url, o.source, o.verified, o.pack_size, o.found_at,
             (o.price_minor / greatest(1, o.pack_size))::bigint as unit_price
      from public.supply_offers o
      where o.supply_item_id = i.id
      order by (o.price_minor / greatest(1, o.pack_size)) asc, o.verified desc, o.found_at desc
      limit 1
    ) b on true
    left join lateral (
      select count(*)::int as total from public.supply_offers o2 where o2.supply_item_id = i.id
    ) c on true
    where i.business_id = p_business_id
  ) t
$$;

revoke all on function private.supply_savings(uuid) from public, anon, authenticated, service_role;
grant execute on function private.supply_savings(uuid) to authenticated, service_role;

create or replace function public.supply_savings(p_business_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.supply_savings(p_business_id) $$;
revoke all on function public.supply_savings(uuid) from public, anon;
grant execute on function public.supply_savings(uuid) to authenticated, service_role;

comment on function public.supply_savings(uuid) is
 'Per-unit comparison of what the venue pays against the cheapest recorded offer. Saving is null when the current price is unknown.';

commit;
