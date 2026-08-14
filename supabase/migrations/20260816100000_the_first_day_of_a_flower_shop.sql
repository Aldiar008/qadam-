begin;

-- Первый день цветочного магазина.
--
-- Регистрация уже умела создавать заведение, точку, профиль и цели. Но она
-- заканчивалась тремя советами про QR-лояльность и источник продаж и включала
-- «первые три инструмента по алфавиту» — это осталось от продукта, который
-- продавал кампании. Цветочному магазину нужно другое: сохранить, чем он
-- торгует и что готов списывать, включить набор первого дня и предложить три
-- действия, которые в его дне действительно есть.
--
-- Базовая функция не переписывается: она делает много общего и правильного, и
-- копировать её ради двух хвостов означало бы завести вторую версию того же
-- кода. Здесь надстройка, которая вызывает её и доводит результат до профиля.

create or replace function private.complete_flower_onboarding(
  p_session_id uuid, p_expected_version integer, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  s public.onboarding_sessions%rowtype;
  v_actor uuid := (select auth.uid());
  v_result jsonb;
  v_mock boolean;
  v_type_code text;
  v_bundle_id uuid;
  v_flower boolean;
begin
  if v_actor is null then raise exception 'authentication required' using errcode='42501'; end if;

  select * into s from public.onboarding_sessions where id = p_session_id and user_id = v_actor;
  if s.id is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_type_code := coalesce(s.draft->>'businessType', '');
  v_flower := v_type_code in ('flower_shop', 'flower_chain');

  -- Цветочная анкета обязана назвать хотя бы одну категорию. Магазин, который
  -- не сказал, чем торгует, получит пустую очередь решений и решит, что продукт
  -- не работает, — а он просто не знает, за чем следить.
  if v_flower and jsonb_array_length(coalesce(s.draft#>'{flower,categories}', '[]'::jsonb)) = 0 then
    raise exception 'at least one flower category is required' using errcode='23514';
  end if;

  v_result := private.complete_onboarding(p_session_id, p_expected_version, p_idempotency_key);

  -- Повторный вызов ничего не доделывает: первый уже всё записал, и второй
  -- проход перезаписал бы профиль черновиком, который с тех пор мог измениться.
  if coalesce((v_result->>'duplicate')::boolean, false) then return v_result; end if;
  if not v_flower then return v_result; end if;

  v_mock := coalesce(s.import_mode, s.draft->>'importMode', 'manual') = 'demo';

  insert into public.business_flower_profiles(
    business_id, shop_kind, city, district, location_count,
    category_codes, holiday_codes, supplier_names, spoilage_tolerance_bps, is_mock)
  values (
    s.business_id,
    case when v_type_code = 'flower_chain' then 'chain' else 'single' end,
    coalesce(nullif(s.draft#>>'{location,city}', ''), 'Алматы'),
    nullif(s.draft#>>'{location,district}', ''),
    greatest(1, coalesce(nullif(s.draft#>>'{flower,locationCount}', '')::integer, 1)),
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(s.draft#>'{flower,categories}')), '{}'),
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(coalesce(s.draft#>'{flower,holidays}', '[]'::jsonb))), '{}'),
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(coalesce(s.draft#>'{flower,suppliers}', '[]'::jsonb))), '{}'),
    coalesce(nullif(s.draft#>>'{flower,spoilageToleranceBps}', '')::integer, 800),
    v_mock)
  on conflict (business_id) do update set
    shop_kind = excluded.shop_kind, city = excluded.city, district = excluded.district,
    location_count = excluded.location_count, category_codes = excluded.category_codes,
    holiday_codes = excluded.holiday_codes, supplier_names = excluded.supplier_names,
    spoilage_tolerance_bps = excluded.spoilage_tolerance_bps, is_mock = excluded.is_mock;

  -- Набор первого дня вместо трёх первых по алфавиту. Порядок в наборе — это
  -- порядок, в котором владелец пройдёт продукт, и он задан администратором.
  select b.id into v_bundle_id
  from public.tool_bundles b
  join public.business_types bt on bt.id = b.business_type_id
  where bt.code = v_type_code and b.status = 'published'
  limit 1;

  if v_bundle_id is not null then
    -- Базовая функция уже включила три инструмента по алфавиту. Здесь они
    -- гасятся, а не удаляются: строка активации — это след действия, и
    -- «инструмент был включён и выключен» честнее, чем «его никогда не было».
    update public.business_tools set status = 'disabled'
    where business_id = s.business_id
      and tool_id not in (select tool_id from public.tool_bundle_items where bundle_id = v_bundle_id);

    insert into public.business_tools(business_id, tool_id, status, activated_by, is_mock)
    select s.business_id, i.tool_id, 'active', v_actor, v_mock
    from public.tool_bundle_items i
    join public.tools t on t.id = i.tool_id and t.status = 'published'
    where i.bundle_id = v_bundle_id
    on conflict(business_id, tool_id) do update set
      status = 'active', activated_by = excluded.activated_by, is_mock = excluded.is_mock;
  end if;

  -- Три стартовых совета из маркетингового продукта не имеют смысла в цветочном
  -- магазине: «настройте QR-лояльность» не отвечает на вопрос, доживёт ли роза
  -- до восьмого марта. Открытые советы заменяются на те, что относятся к делу.
  delete from public.recommendations
  where business_id = s.business_id
    and status = 'open'
    and origin_key in ('onboarding:data_quality', 'onboarding:loyalty', 'onboarding:source');

  insert into public.recommendations(business_id, title_ru, title_kk, explanation, confidence, status, is_mock, origin_key)
  values
    (s.business_id, 'Отметьте, что стоит на витрине сейчас', 'Витринада қазір не тұрғанын белгілеңіз',
     jsonb_build_object('reason', 'Без остатка продукт не знает, чего не хватит к празднику', 'gos', null), 80, 'open', v_mock, 'onboarding:flower_stock'),
    (s.business_id, 'Одобрите ближайший повод в календаре', 'Күнтізбедегі жақын себепті мақұлдаңыз',
     jsonb_build_object('reason', 'Праздник двигает спрос только после вашего подтверждения', 'gos', null), 75, 'open', v_mock, 'onboarding:flower_calendar'),
    (s.business_id, 'Добавьте предложения поставщиков', 'Жеткізушілердің ұсыныстарын қосыңыз',
     jsonb_build_object('reason', 'Сравнение и дробление заказа работают, когда поставщиков больше одного', 'gos', null), 70, 'open', v_mock, 'onboarding:flower_suppliers')
  on conflict(business_id, origin_key) where origin_key is not null do nothing;

  return v_result;
end $$;

revoke all on function private.complete_flower_onboarding(uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function private.complete_flower_onboarding(uuid, integer, text) to authenticated;

create or replace function public.complete_flower_onboarding(
  p_session_id uuid, p_expected_version integer, p_idempotency_key text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.complete_flower_onboarding(p_session_id, p_expected_version, p_idempotency_key) $$;

revoke all on function public.complete_flower_onboarding(uuid, integer, text) from public, anon;
grant execute on function public.complete_flower_onboarding(uuid, integer, text) to authenticated;

comment on function public.complete_flower_onboarding(uuid, integer, text) is
 'Завершает регистрацию цветочного магазина: профиль, набор инструментов первого дня и три действия, которые в его дне есть.';

commit;
