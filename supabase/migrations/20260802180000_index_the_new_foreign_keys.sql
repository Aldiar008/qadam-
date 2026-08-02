begin;

-- Every foreign key column gets an index of its own.
--
-- The schema tests assert this for the whole database, and the two tables added
-- for Telegram broke it. Their unique indexes lead with `business_id`, so the
-- planner cannot use them to answer "which rows point at this customer" — which
-- is exactly the question `on delete cascade` asks when a guest exercises their
-- right to be forgotten. Without these, deleting one customer scans the table.
create index if not exists channel_addresses_customer_fk_idx
  on private.channel_addresses(customer_id);
create index if not exists channel_addresses_owner_fk_idx
  on private.channel_addresses(owner_user_id);
create index if not exists telegram_link_codes_business_fk_idx
  on private.telegram_link_codes(business_id);
create index if not exists telegram_link_codes_user_fk_idx
  on private.telegram_link_codes(user_id);

do $$
declare v_missing text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || a.attname, ', ')
  into v_missing
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and a.attnum = i.indkey[0]);

  if v_missing is not null then
    raise exception 'foreign key columns without a leading index: %', v_missing;
  end if;
end $$;

commit;
