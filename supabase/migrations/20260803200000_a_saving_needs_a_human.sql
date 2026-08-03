begin;

-- Экономия считается только по подтверждённой цене.
--
-- The search for «салфетки барные бумажные» came back with a pack of hooks at
-- 31 ₸ apiece, and the screen turned it into «экономия 14 360 ₸ в месяц»
-- against napkins at 390 ₸. Nothing was invented: the product, the price and
-- the link were all real. It was the wrong product, and per-unit arithmetic
-- cannot tell — «шт» is «шт».
--
-- Marketplace relevance is not something this product can fix, and pretending
-- otherwise would put a number in front of an owner that a machine has no way
-- to stand behind. So the roles are separated:
--
--   candidate — cheapest listing nobody has looked at. Shown with its title and
--               its link, counted towards nothing.
--   best      — cheapest price a person confirmed. Only this produces a saving.
--
-- Confirming is one press, and it is the press that says «это тот же товар».
-- That judgement belongs to the person standing in the storeroom.

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
        'id', b.id, 'supplier', b.supplier, 'title', b.title, 'unitPriceMinor', b.unit_price,
        'packSize', b.pack_size, 'url', b.url, 'source', b.source,
        'verified', true, 'foundAt', b.found_at) end,
      -- The cheapest thing found automatically, shown only when it would beat
      -- what the venue pays. A candidate that is more expensive than the current
      -- price is not news.
      'candidate', case when c.id is null then null else jsonb_build_object(
        'id', c.id, 'supplier', c.supplier, 'title', c.title, 'unitPriceMinor', c.unit_price,
        'packSize', c.pack_size, 'url', c.url, 'source', c.source, 'foundAt', c.found_at) end,
      'offerCount', coalesce(n.total, 0),
      'unverifiedCount', coalesce(n.unverified, 0),
      -- Both figures come from `b`, the confirmed price, and from nowhere else.
      'savingMinor', case when i.current_price_minor is null or b.unit_price is null then null
                          else greatest(0, i.current_price_minor - b.unit_price) end,
      'monthlySavingMinor', case when i.current_price_minor is null or b.unit_price is null or i.monthly_quantity is null then null
                                 else greatest(0, i.current_price_minor - b.unit_price) * i.monthly_quantity end) as row
    from public.supply_items i
    left join lateral (
      select o.id, o.supplier, o.title, o.url, o.source, o.pack_size, o.found_at,
             (o.price_minor / greatest(1, o.pack_size))::bigint as unit_price
      from public.supply_offers o
      where o.supply_item_id = i.id and o.verified
      order by (o.price_minor / greatest(1, o.pack_size)) asc, o.found_at desc
      limit 1
    ) b on true
    left join lateral (
      select o.id, o.supplier, o.title, o.url, o.source, o.pack_size, o.found_at,
             (o.price_minor / greatest(1, o.pack_size))::bigint as unit_price
      from public.supply_offers o
      where o.supply_item_id = i.id and not o.verified
        and (i.current_price_minor is null
             or (o.price_minor / greatest(1, o.pack_size)) < i.current_price_minor)
      order by (o.price_minor / greatest(1, o.pack_size)) asc, o.found_at desc
      limit 1
    ) c on true
    left join lateral (
      select count(*)::int as total, count(*) filter (where not o2.verified)::int as unverified
      from public.supply_offers o2 where o2.supply_item_id = i.id
    ) n on true
    where i.business_id = p_business_id
  ) t
$$;

revoke all on function private.supply_savings(uuid) from public, anon, authenticated, service_role;
grant execute on function private.supply_savings(uuid) to authenticated, service_role;

comment on function public.supply_savings(uuid) is
 'Per-unit comparison against the cheapest CONFIRMED offer. Automatically found listings appear as `candidate` and count towards no saving until a person confirms the product is the same one.';

commit;
