begin;

-- Prompt 3 completion: database-backed CSV customer import and atomic QR rotation.

alter table public.data_imports add column idempotency_key text;
alter table public.data_imports add column summary jsonb not null default '{}'::jsonb
 check (jsonb_typeof(summary)='object');
create unique index data_imports_idempotency_uidx on public.data_imports(business_id,idempotency_key)
 where idempotency_key is not null;
create index data_imports_business_created_idx on public.data_imports(business_id,created_at desc,id);

-- ---------------------------------------------------------------------------
-- CSV customer import
--
-- The import is deliberately conservative: it creates customers, hashed
-- identities and an explicit marketing-consent record. It never fabricates
-- transactions, so declared visits/AOV are stored on the import summary and
-- only used to derive an initial lifecycle stage.
-- ---------------------------------------------------------------------------
create or replace function private.import_customers(
 p_business_id uuid,p_rows jsonb,p_duplicate_strategy text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_mock boolean; v_import_id uuid; v_result jsonb; v_receipt jsonb;
 r record; v_hash bytea; v_customer_id uuid; v_masked text; v_stage text;
 v_inserted integer := 0; v_updated integer := 0; v_skipped integer := 0; v_invalid integer := 0;
 v_total integer;
begin
 if v_actor is null or not private.has_business_role(p_business_id,array['owner','manager']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if p_duplicate_strategy not in ('skip','update') then
  raise exception 'unsupported duplicate strategy' using errcode='22023';
 end if;
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
  raise exception 'invalid idempotency key' using errcode='22023';
 end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'rows must be an array' using errcode='22023'; end if;
 v_total := jsonb_array_length(p_rows);
 if v_total > 1000 then raise exception 'import is limited to 1000 rows per batch' using errcode='22023'; end if;

 select result into v_receipt from private.domain_command_receipts
 where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt||jsonb_build_object('duplicate',true); end if;

 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 insert into public.data_imports(business_id,source_type,status,rows_total,started_at,idempotency_key,is_mock)
 values(p_business_id,'csv_customers','running',v_total,now(),p_idempotency_key,v_mock)
 returning id into v_import_id;

 for r in
  select (x->>'display_name') as display_name,
         lower(coalesce(x->>'identity_type','')) as identity_type,
         trim(coalesce(x->>'identity_value','')) as identity_value,
         coalesce((x->>'visits')::integer,0) as visits,
         coalesce((x->>'aov_minor')::bigint,0) as aov_minor,
         coalesce((x->>'marketing_consent')::boolean,false) as marketing_consent,
         coalesce((x->>'row_number')::integer,ordinality::integer) as row_number
  from jsonb_array_elements(p_rows) with ordinality as t(x,ordinality)
 loop
  if r.identity_type not in ('email','phone') or char_length(r.identity_value) < 5
   or (r.identity_type='email' and r.identity_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
   or (r.identity_type='phone' and char_length(regexp_replace(r.identity_value,'\D','','g')) < 7) then
   v_invalid := v_invalid + 1;
   insert into public.data_import_errors(business_id,data_import_id,row_number,code,message,details,is_mock)
   values(p_business_id,v_import_id,r.row_number,'INVALID_IDENTITY',
    'Контакт отсутствует или имеет неверный формат',
    jsonb_build_object('identity_type',r.identity_type),v_mock);
   continue;
  end if;

  v_hash := extensions.digest(convert_to(lower(r.identity_value),'utf8'),'sha256');
  perform pg_advisory_xact_lock(hashtextextended(encode(v_hash,'hex'),0));

  select customer_id into v_customer_id from public.customer_identities
  where business_id=p_business_id and identity_type=r.identity_type and lookup_hash=v_hash;

  v_stage := case when r.visits >= 10 then 'loyal' when r.visits >= 2 then 'active' else 'new' end;

  if v_customer_id is not null then
   if p_duplicate_strategy='skip' then
    v_skipped := v_skipped + 1;
    continue;
   end if;
   update public.customers
   set display_name=coalesce(nullif(trim(coalesce(r.display_name,'')),''),display_name),
       lifecycle_stage=case when lifecycle_stage in ('anonymized','churned') then lifecycle_stage else v_stage end,
       last_seen_at=greatest(coalesce(last_seen_at,now()),now())
   where id=v_customer_id and business_id=p_business_id;
   v_updated := v_updated + 1;
  else
   insert into public.customers(business_id,display_name,preferred_locale,lifecycle_stage,first_seen_at,last_seen_at,is_mock)
   values(p_business_id,nullif(trim(coalesce(r.display_name,'')),''),'ru',v_stage,now(),now(),v_mock)
   returning id into v_customer_id;
   v_masked := case when r.identity_type='email'
    then left(split_part(lower(r.identity_value),'@',1),2)||'***@'||split_part(lower(r.identity_value),'@',2)
    else '***'||right(regexp_replace(r.identity_value,'\D','','g'),4) end;
   insert into public.customer_identities(business_id,customer_id,identity_type,lookup_hash,masked_value,is_primary,is_mock)
   values(p_business_id,v_customer_id,r.identity_type,v_hash,v_masked,true,v_mock);
   v_inserted := v_inserted + 1;
  end if;

  -- Marketing consent is recorded exactly as declared in the file, with the
  -- import as the auditable source. Loyalty consent is never fabricated here.
  insert into public.customer_consents(business_id,customer_id,scope,status,source,evidence,granted_at,is_mock)
  values(p_business_id,v_customer_id,'marketing',
   case when r.marketing_consent then 'granted' else 'denied' end,'csv_import',
   jsonb_build_object('data_import_id',v_import_id,'row_number',r.row_number,'declared_by_owner',true),
   case when r.marketing_consent then now() else null end,v_mock);
 end loop;

 v_result := jsonb_build_object(
  'data_import_id',v_import_id,'rows_total',v_total,'inserted',v_inserted,'updated',v_updated,
  'skipped',v_skipped,'invalid',v_invalid,'duplicate_strategy',p_duplicate_strategy,'duplicate',false);

 update public.data_imports
 set status='completed',rows_processed=v_inserted+v_updated+v_skipped,completed_at=now(),summary=v_result
 where id=v_import_id;

 insert into private.domain_command_receipts
 values(p_business_id,p_idempotency_key,'customers.import','data_import',v_import_id,v_result,now());
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'customers.imported','data_import',v_import_id,v_result,v_mock);
 return v_result;
end $$;
revoke all on function private.import_customers(uuid,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function private.import_customers(uuid,jsonb,text,text) to authenticated;

create or replace function public.import_customers(
 p_business_id uuid,p_rows jsonb,p_duplicate_strategy text,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.import_customers(p_business_id,p_rows,p_duplicate_strategy,p_idempotency_key) $$;
revoke all on function public.import_customers(uuid,jsonb,text,text) from public,anon;
grant execute on function public.import_customers(uuid,jsonb,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic QR rotation for a named program
-- ---------------------------------------------------------------------------
create or replace function private.rotate_qr_code(
 p_business_id uuid,p_loyalty_program_id uuid,p_qr_id uuid,p_token text,p_expires_at timestamptz,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid()); v_mock boolean; v_program record; v_old public.qr_codes%rowtype;
 v_new_id uuid; v_result jsonb; v_receipt jsonb;
begin
 if v_actor is null or not private.has_business_role(p_business_id,array['owner','manager']) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if char_length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
  raise exception 'invalid idempotency key' using errcode='22023';
 end if;
 if char_length(coalesce(p_token,'')) < 32 then
  raise exception 'QR token must be at least 32 characters' using errcode='22023';
 end if;
 if p_expires_at is not null and p_expires_at <= now() then
  raise exception 'expiry must be in the future' using errcode='22023';
 end if;

 select result into v_receipt from private.domain_command_receipts
 where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if v_receipt is not null then return v_receipt||jsonb_build_object('duplicate',true); end if;

 select id,name,status into v_program from public.loyalty_programs
 where id=p_loyalty_program_id and business_id=p_business_id for update;
 if v_program.id is null then raise exception 'loyalty program not found' using errcode='23503'; end if;
 if v_program.status<>'active' then raise exception 'loyalty program is not active' using errcode='23514'; end if;

 select mode='demo' into v_mock from public.businesses where id=p_business_id;

 if p_qr_id is not null then
  select * into v_old from public.qr_codes
  where id=p_qr_id and business_id=p_business_id and loyalty_program_id=p_loyalty_program_id for update;
  if v_old.id is null then raise exception 'QR code not found for this program' using errcode='23503'; end if;
 end if;

 -- Only one active join QR per program: previous ones are marked rotated.
 update public.qr_codes set status='rotated',revoked_at=now()
 where business_id=p_business_id and loyalty_program_id=p_loyalty_program_id
  and purpose='loyalty_join' and status='active';

 insert into public.qr_codes(business_id,location_id,loyalty_program_id,token_hash,purpose,status,expires_at,
  rotated_from_id,public_context,created_by,is_mock)
 select p_business_id,v_old.location_id,p_loyalty_program_id,
  extensions.digest(convert_to(p_token,'utf8'),'sha256'),'loyalty_join','active',p_expires_at,
  p_qr_id,
  jsonb_build_object('business_name',(select name from public.businesses where id=p_business_id),
                     'program_name',v_program.name),
  v_actor,v_mock
 returning id into v_new_id;

 v_result := jsonb_build_object('qr_code_id',v_new_id,'loyalty_program_id',p_loyalty_program_id,
  'rotated_from',p_qr_id,'expires_at',p_expires_at,'duplicate',false);
 insert into private.domain_command_receipts
 values(p_business_id,p_idempotency_key,'qr.rotate','qr_code',v_new_id,v_result,now());
 insert into public.activity_logs(business_id,actor_id,action,resource_type,resource_id,metadata,is_mock)
 values(p_business_id,v_actor,'qr.rotated','qr_code',v_new_id,v_result,v_mock);
 return v_result;
end $$;
revoke all on function private.rotate_qr_code(uuid,uuid,uuid,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function private.rotate_qr_code(uuid,uuid,uuid,text,timestamptz,text) to authenticated;

create or replace function public.rotate_qr_code(
 p_business_id uuid,p_loyalty_program_id uuid,p_qr_id uuid,p_token text,p_expires_at timestamptz,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.rotate_qr_code(p_business_id,p_loyalty_program_id,p_qr_id,p_token,p_expires_at,p_idempotency_key) $$;
revoke all on function public.rotate_qr_code(uuid,uuid,uuid,text,timestamptz,text) from public,anon;
grant execute on function public.rotate_qr_code(uuid,uuid,uuid,text,timestamptz,text) to authenticated;

comment on function public.import_customers(uuid,jsonb,text,text) is
 'Idempotent CSV customer import: hashed identities, declared marketing consent, per-row error log. Never fabricates transactions.';
comment on function public.rotate_qr_code(uuid,uuid,uuid,text,timestamptz,text) is
 'Atomic QR rotation: previous join QR for the program becomes rotated, a new opaque token hash becomes active.';

commit;
