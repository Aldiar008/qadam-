begin;

-- ===========================================================================
-- Plans and entitlements as configurable records.
--
-- Nothing in the application branches on a plan code. A plan grants values for
-- named entitlement keys; the server reads those values. Adding a tier or
-- changing a limit is a data change, not a code change.
-- ===========================================================================

alter table public.plans add column tier_order smallint not null default 0;
alter table public.plans add column description_ru text;
alter table public.plans add column description_kk text;

insert into public.entitlements(key, description, value_kind) values
 ('businesses',            'Сколько бизнесов может завести владелец',                'integer'),
 ('locations',             'Точек на бизнес',                                        'integer'),
 ('growth_contracts_month','Growth Contract в месяц',                                'integer'),
 ('channels',              'Одновременно подключённых каналов',                      'integer'),
 ('automations',           'Активных правил автоматизации',                          'integer'),
 ('team_size',             'Участников команды',                                     'integer'),
 ('ai_generations_month',  'Обращений к языковой модели в месяц',                    'integer'),
 ('customers',             'Клиентов в базе',                                        'integer'),
 ('nearby_offers',         'Одновременных публикаций в «Акции рядом»',               'integer')
on conflict (key) do nothing;

insert into public.plans(code, name, status, price_minor, currency, billing_period, is_public, tier_order, description_ru, description_kk) values
 ('free',    'Free',    'active',      0, 'KZT', 'month', true, 1,
  'Попробовать QADAM на одной точке и небольшой базе.',           'QADAM-ды бір нүктеде және шағын базада байқап көру.'),
 ('start',   'Start',   'active',   9900, 'KZT', 'month', true, 2,
  'Для одной точки, которая уже работает с постоянными гостями.',  'Тұрақты қонақтармен жұмыс істейтін бір нүктеге.'),
 ('growth',  'Growth',  'active',  24900, 'KZT', 'month', true, 3,
  'Для растущего бизнеса с несколькими каналами и командой.',      'Бірнеше арнасы мен командасы бар өсіп келе жатқан бизнеске.'),
 ('pro',     'Pro',     'active',  49900, 'KZT', 'month', true, 4,
  'Для сети точек с автоматизациями и большой базой.',             'Автоматтандыруы мен үлкен базасы бар нүктелер желісіне.'),
 ('partner', 'Partner', 'active',      0, 'KZT', 'month', false, 5,
  'Партнёрский тариф: лимиты согласуются индивидуально.',          'Серіктестік тариф: лимиттер жеке келісіледі.')
on conflict (code) do update set
 status=excluded.status, price_minor=excluded.price_minor, tier_order=excluded.tier_order,
 description_ru=excluded.description_ru, description_kk=excluded.description_kk;

-- Grants per plan. `unlimited` is a deliberate, explicit value: the absence of a
-- row means "not permitted", never "no limit".
-- `value` is jsonb, so a scalar grant is stored as a JSON string.
insert into public.plan_entitlements(plan_id, entitlement_id, value)
select p.id, e.id, to_jsonb(v.value)
from (values
 ('free','businesses','1'),('free','locations','1'),('free','growth_contracts_month','2'),
 ('free','channels','1'),('free','automations','1'),('free','team_size','1'),
 ('free','ai_generations_month','10'),('free','customers','200'),('free','nearby_offers','1'),

 ('start','businesses','1'),('start','locations','2'),('start','growth_contracts_month','8'),
 ('start','channels','2'),('start','automations','3'),('start','team_size','3'),
 ('start','ai_generations_month','60'),('start','customers','2000'),('start','nearby_offers','3'),

 ('growth','businesses','2'),('growth','locations','5'),('growth','growth_contracts_month','25'),
 ('growth','channels','4'),('growth','automations','8'),('growth','team_size','8'),
 ('growth','ai_generations_month','250'),('growth','customers','10000'),('growth','nearby_offers','10'),

 ('pro','businesses','5'),('pro','locations','20'),('pro','growth_contracts_month','100'),
 ('pro','channels','6'),('pro','automations','20'),('pro','team_size','25'),
 ('pro','ai_generations_month','1000'),('pro','customers','50000'),('pro','nearby_offers','30'),

 ('partner','businesses','unlimited'),('partner','locations','unlimited'),('partner','growth_contracts_month','unlimited'),
 ('partner','channels','unlimited'),('partner','automations','unlimited'),('partner','team_size','unlimited'),
 ('partner','ai_generations_month','unlimited'),('partner','customers','unlimited'),('partner','nearby_offers','unlimited')
) as v(plan_code, entitlement_key, value)
join public.plans p on p.code = v.plan_code
join public.entitlements e on e.key = v.entitlement_key
on conflict (plan_id, entitlement_id) do update set value = excluded.value;

/**
 * Resolves one entitlement value.
 *
 * `plan_entitlements.value` is jsonb, so the scalar is extracted rather than
 * cast. A business with no subscription row resolves against Free — that is the
 * product rule, and it is safer than "nothing permitted", which would lock a
 * brand-new business out of its own onboarding. A plan that simply does not
 * grant a key still resolves to null, which callers treat as not permitted.
 */
create or replace function private.entitlement_value(p_business_id uuid, p_key text)
returns text language sql stable security definer set search_path=''
as $fn$
 select coalesce(
  (select pe.value #>> '{}'
   from public.subscriptions s
   join public.plan_entitlements pe on pe.plan_id = s.plan_id
   join public.entitlements e on e.id = pe.entitlement_id and e.key = p_key
   where s.business_id = p_business_id and s.status in ('active','trialing','past_due')
   order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end
   limit 1),
  (select pe.value #>> '{}'
   from public.plans p
   join public.plan_entitlements pe on pe.plan_id = p.id
   join public.entitlements e on e.id = pe.entitlement_id and e.key = p_key
   where p.code = 'free'
   limit 1)
 )
$fn$;

-- Migrations run before the seed, so no business exists here to subscribe. Any
-- legacy row pointing at the entitlement-less 'demo' plan is repointed at
-- Growth; everything else resolves through the Free fallback above.
update public.subscriptions s set plan_id = (select id from public.plans where code='growth')
where s.plan_id = (select id from public.plans where code='demo');

update public.plans set status='archived', is_public=false where code='demo';

-- ---------------------------------------------------------------------------
-- Billing provider state, kept provider-neutral.
--
-- No payment provider is configured. The columns exist so a provider can be
-- attached later without a schema change, and the CHECK makes it impossible to
-- record a paid subscription while the provider is still 'none'.
-- ---------------------------------------------------------------------------
alter table public.subscriptions add column grace_period_ends_at timestamptz;
alter table public.subscriptions add column cancel_at timestamptz;
alter table public.subscriptions add column last_provider_event_id text;
alter table public.subscriptions add constraint subscriptions_provider_ref_requires_provider
 check (provider_subscription_ref is null or provider <> 'none');

create table public.billing_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null,
 external_event_id text not null,
 event_type text not null,
 signature_verified boolean not null default false,
 payload jsonb not null default '{}'::jsonb,
 processed_at timestamptz,
 received_at timestamptz not null default now(),
 is_mock boolean not null default false,
 unique (provider, external_event_id)
);
create index billing_events_business_id_fk_idx on public.billing_events(business_id);

alter table public.billing_events enable row level security;
create policy billing_events_owner_select on public.billing_events for select to authenticated
 using ((select private.has_business_role(business_id, array['owner'])));
revoke all on public.billing_events from anon, authenticated;
grant select on public.billing_events to authenticated;
grant all on public.billing_events to service_role;

comment on table public.billing_events is
 'Provider-neutral billing event log. Empty until a payment provider is connected; an unverified event is never processed.';
comment on column public.subscriptions.grace_period_ends_at is
 'How long a past_due subscription keeps working before entitlements drop to Free.';

commit;
