begin;

-- Предложение обязано называть товар.
--
-- The screen showed «Kaspi.kz — 14 ₸ за шт» against «платим 62 ₸ за стакан» and
-- called the difference a saving. The 14 ₸ listing was a pack of lids: a
-- marketplace search for «стаканы 400 мл с крышками» returns cups, lids and
-- 250 ml cups together, and nothing in the row let the owner tell them apart.
--
-- A per-unit comparison between two different products is not a comparison, and
-- presenting one as a saving is precisely the failure this module was shaped to
-- avoid — just arriving through relevance instead of through a made-up price.
-- The title travels with the offer and is shown next to it, so the owner is the
-- one who decides whether it is the same thing.

alter table public.supply_offers
  add column if not exists title text check (title is null or char_length(title) between 2 and 300);

comment on column public.supply_offers.title is
 'What the marketplace calls this listing. Without it a per-unit price cannot be judged: a lid and a cup are both «шт».';

-- Лучшее предложение теперь тоже называет товар.
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
        'verified', b.verified, 'foundAt', b.found_at) end,
      'offerCount', coalesce(c.total, 0),
      'savingMinor', case when i.current_price_minor is null or b.unit_price is null then null
                          else greatest(0, i.current_price_minor - b.unit_price) end,
      'monthlySavingMinor', case when i.current_price_minor is null or b.unit_price is null or i.monthly_quantity is null then null
                                 else greatest(0, i.current_price_minor - b.unit_price) * i.monthly_quantity end) as row
    from public.supply_items i
    left join lateral (
      select o.id, o.supplier, o.title, o.url, o.source, o.verified, o.pack_size, o.found_at,
             (o.price_minor / greatest(1, o.pack_size))::bigint as unit_price
      from public.supply_offers o
      where o.supply_item_id = i.id
      -- A price a person confirmed outranks a cheaper one nobody has looked at.
      -- The cheapest unchecked listing is a candidate, not a decision.
      order by o.verified desc, (o.price_minor / greatest(1, o.pack_size)) asc, o.found_at desc
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

commit;
