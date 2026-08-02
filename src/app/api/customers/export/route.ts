import { NextResponse } from 'next/server';

import { canMarket, requireBusinessContext } from '@/server/qadam/repository';

/**
 * The customer export, as a file.
 *
 * «Экспорт CSV» used to write an entry in the activity log and return nothing:
 * the audit trail said an export happened, the person got no file, and both
 * were true. The log entry is still written — an export of the client base is
 * exactly the action that must leave a trace — but now something is actually
 * exported.
 *
 * What leaves the building is what the cabinet already shows: the masked
 * contact, never a raw one. There is no column holding a full phone number or
 * address, so this cannot leak one even by mistake.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CSV_INJECTION = /^[=+\-@\t\r]/;

/** Excel executes a cell that starts with `=`; a quote makes it text again. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = CSV_INJECTION.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET() {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [{ data: customers }, { data: identities }, { data: consents }, { data: accounts }] = await Promise.all([
    ctx.supabase.from('customers').select('id,display_name,lifecycle_stage,first_seen_at,last_seen_at')
      .eq('business_id', ctx.businessId).neq('lifecycle_stage', 'anonymized').order('created_at', { ascending: false }).limit(5000),
    ctx.supabase.from('customer_identities').select('customer_id,identity_type,masked_value').eq('business_id', ctx.businessId).eq('is_primary', true).limit(5000),
    ctx.supabase.from('customer_consents').select('customer_id,scope,status,created_at').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(20000),
    ctx.supabase.from('loyalty_accounts').select('customer_id,points_balance,stamps_balance').eq('business_id', ctx.businessId).limit(5000),
  ]);

  const identityOf = new Map((identities ?? []).map((row) => [row.customer_id, row]));
  const accountOf = new Map((accounts ?? []).map((row) => [row.customer_id, row]));
  const marketing = new Map<string, string>();
  for (const row of consents ?? []) {
    if (!row.scope.startsWith('marketing')) continue;
    if (!marketing.has(row.customer_id)) marketing.set(row.customer_id, row.status);
  }

  const header = ['id', 'name', 'stage', 'contact_masked', 'contact_type', 'marketing_consent', 'stamps', 'points', 'first_seen', 'last_seen'];
  const lines = [header.join(',')];
  for (const customer of customers ?? []) {
    const identity = identityOf.get(customer.id);
    const account = accountOf.get(customer.id);
    lines.push([
      cell(customer.id), cell(customer.display_name), cell(customer.lifecycle_stage),
      cell(identity?.masked_value ?? ''), cell(identity?.identity_type ?? ''),
      cell(marketing.get(customer.id) ?? 'none'),
      cell(account?.stamps_balance ?? 0), cell(account?.points_balance ?? 0),
      cell(customer.first_seen_at ?? ''), cell(customer.last_seen_at ?? ''),
    ].join(','));
  }

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: 'customers.exported',
    resource_type: 'customer',
    resource_id: ctx.businessId,
    metadata: { format: 'csv', rows: (customers ?? []).length, exported_at: new Date().toISOString() },
    is_mock: ctx.business.mode === 'demo',
  });

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel on Windows opens Cyrillic correctly instead of showing mojibake.
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="qadam-customers-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
