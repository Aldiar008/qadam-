begin;

-- Центр обращений: тема, настроение, срочность и кто в итоге ответил.
--
-- Гость уже мог написать заведению из мини-приложения, а владелец — ответить в
-- разделе «Вопросы гостей». Не было главного: сообщение никак не разбиралось.
-- Всё, что писал гость, ложилось одной кучей со статусом «нужен человек», даже
-- когда это был вопрос о часах работы, на который у продукта есть точный ответ.
--
-- Здесь появляется разбор: тема, настроение, срочность и предложенный ответ. И
-- вместе с ним — правило, кто имеет право этот ответ отправить.

alter table public.customer_interactions
  add column if not exists category text,
  add column if not exists sentiment text,
  add column if not exists urgency smallint,
  add column if not exists status text,
  add column if not exists draft_reply text,
  add column if not exists answered_by text,
  add column if not exists answered_at timestamptz,
  add column if not exists answered_interaction_id uuid references public.customer_interactions(id) on delete set null;

comment on column public.customer_interactions.category is
  'Тема обращения глазами разбора: hours, menu, order, booking, question, gratitude, review, suggestion, complaint, money, other. NULL — обращение ещё не разбиралось.';
comment on column public.customer_interactions.status is
  'Судьба входящего обращения: auto_answered — ответил ассистент; awaiting_owner — ждёт владельца; answered — владелец ответил; closed — закрыто без ответа.';
comment on column public.customer_interactions.answered_by is
  'Кто написал ответ: ai или owner. Гость видит это же в истории — подпись под ответом не должна расходиться с записью в базе.';
comment on column public.customer_interactions.draft_reply is
  'Проект ответа, подготовленный ассистентом. Для обращений, требующих подтверждения, он показывается владельцу и не уходит гостю сам.';

alter table public.customer_interactions
  drop constraint if exists customer_interactions_status_check;
alter table public.customer_interactions
  add constraint customer_interactions_status_check
  check (status is null or status in ('auto_answered', 'awaiting_owner', 'answered', 'closed'));

alter table public.customer_interactions
  drop constraint if exists customer_interactions_sentiment_check;
alter table public.customer_interactions
  add constraint customer_interactions_sentiment_check
  check (sentiment is null or sentiment in ('positive', 'neutral', 'negative'));

alter table public.customer_interactions
  drop constraint if exists customer_interactions_urgency_check;
alter table public.customer_interactions
  add constraint customer_interactions_urgency_check
  check (urgency is null or urgency between 1 and 3);

alter table public.customer_interactions
  drop constraint if exists customer_interactions_answered_by_check;
alter table public.customer_interactions
  add constraint customer_interactions_answered_by_check
  check (answered_by is null or answered_by in ('ai', 'owner'));

create index if not exists customer_interactions_desk_idx
  on public.customer_interactions (business_id, status, occurred_at desc)
  where direction = 'inbound';

-- ---------------------------------------------------------------------------
-- Что ассистенту разрешено отвечать самому
-- ---------------------------------------------------------------------------
--
-- Владелец решает это сам, по темам. Но не по всем: жалоба и всё, что про
-- деньги — возврат, компенсация, скидка, изменение цены — не переводятся на
-- автомат никаким переключателем. Это не настройка со значением по умолчанию,
-- а правило: ответ от имени заведения, который стоит денег или репутации,
-- отправляет человек.
--
-- Проверка стоит в базе, а не только в интерфейсе. Экран можно обойти;
-- ограничение таблицы — нет.
create table if not exists public.inquiry_policies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null,
  mode text not null check (mode in ('auto', 'approve')),
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, category),
  constraint inquiry_policies_money_and_complaints_need_a_human
    check (not (mode = 'auto' and category in ('complaint', 'money')))
);

comment on table public.inquiry_policies is
  'По каким темам ассистент отвечает гостю сам. Жалобы и денежные темы в автомат не переводятся — ограничение таблицы, а не соглашение.';

alter table public.inquiry_policies enable row level security;

create policy inquiry_policies_member_all on public.inquiry_policies
  for all to authenticated
  using (exists (select 1 from public.business_members bm where bm.business_id = inquiry_policies.business_id
                 and bm.user_id = (select auth.uid()) and bm.status = 'active'))
  with check (exists (select 1 from public.business_members bm where bm.business_id = inquiry_policies.business_id
                      and bm.user_id = (select auth.uid()) and bm.status = 'active'
                      and bm.role in ('owner', 'manager')));

grant select, insert, update, delete on table public.inquiry_policies to authenticated;
grant select, insert, update, delete on table public.inquiry_policies to service_role;

create trigger inquiry_policies_business_id_immutable
  before update on public.inquiry_policies
  for each row execute function private.prevent_business_id_change();
create trigger inquiry_policies_mock_tenant_guard
  before insert or update on public.inquiry_policies
  for each row execute function private.enforce_mock_tenant();

-- ---------------------------------------------------------------------------
-- Ответ гостю — одной записью
-- ---------------------------------------------------------------------------
--
-- Ответ состоит из двух действий: исходящее сообщение гостю и отметка на
-- обращении. Раздельно они расходятся: гость получает ответ, а обращение
-- остаётся «ждёт владельца», или наоборот. Здесь они происходят вместе.
create or replace function private.answer_inquiry(
  p_inquiry_id uuid,
  p_body text,
  p_answered_by text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_inquiry public.customer_interactions%rowtype; v_mock boolean; v_reply uuid;
begin
  if p_answered_by not in ('ai', 'owner') then
    raise exception 'answer author must be ai or owner' using errcode='23514';
  end if;
  if char_length(coalesce(p_body, '')) < 2 then
    raise exception 'an empty answer is not an answer' using errcode='23514';
  end if;

  select * into v_inquiry from public.customer_interactions
  where id = p_inquiry_id and direction = 'inbound' for update;
  if v_inquiry.id is null then
    raise exception 'inquiry not found' using errcode='23503';
  end if;

  -- Жалобы и деньги ассистент не отправляет сам ни при каких настройках.
  if p_answered_by = 'ai' and coalesce(v_inquiry.category, 'other') in ('complaint', 'money') then
    raise exception 'this category is answered by a person, not by the assistant' using errcode='42501';
  end if;
  if p_answered_by = 'ai' and v_inquiry.status in ('answered', 'auto_answered') then
    raise exception 'this inquiry already has an answer' using errcode='23505';
  end if;

  select b.mode = 'demo' into v_mock from public.businesses b where b.id = v_inquiry.business_id;

  insert into public.customer_interactions(
    business_id, customer_id, channel, direction, kind, body, metadata, is_mock,
    status, answered_by)
  values (
    v_inquiry.business_id, v_inquiry.customer_id, v_inquiry.channel, 'outbound', 'answer',
    left(p_body, 4000),
    jsonb_build_object('source', p_answered_by, 'in_reply_to', p_inquiry_id),
    coalesce(v_mock, false), null, p_answered_by)
  returning id into v_reply;

  update public.customer_interactions
  set status = case when p_answered_by = 'ai' then 'auto_answered' else 'answered' end,
      answered_by = p_answered_by,
      answered_at = now(),
      answered_interaction_id = v_reply
  where id = p_inquiry_id;

  return v_reply;
end $$;

revoke all on function private.answer_inquiry(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function private.answer_inquiry(uuid, text, text) to service_role;

create or replace function public.answer_inquiry(p_inquiry_id uuid, p_body text, p_answered_by text)
returns uuid language sql security invoker set search_path=''
as $$ select private.answer_inquiry(p_inquiry_id, p_body, p_answered_by) $$;
revoke all on function public.answer_inquiry(uuid, text, text) from public, anon, authenticated;
grant execute on function public.answer_inquiry(uuid, text, text) to service_role;

commit;
