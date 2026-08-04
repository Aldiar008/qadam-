import { NextResponse } from 'next/server';

import { canMarket, requireBusinessContext } from '@/server/qadam/repository';

/**
 * Пакет материалов одним файлом.
 *
 * Съёмка Reels происходит не за компьютером. Владельцу нужен сценарий на
 * телефоне, а не вкладка браузера, поэтому весь пакет отдаётся обычным
 * markdown-файлом: тексты, CTA, alt text и подпись, на каком языке что
 * написано. Ничего не публикует — публикует человек, и файл существует именно
 * для того, чтобы ему было с чем прийти на площадку.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KIND_TITLES: Record<string, string> = {
  post: 'Основной пост',
  short_post: 'Короткая публикация',
  story: 'Stories',
  story_series: 'Серия сторис',
  direct_message: 'Сообщение в мессенджер',
  video_script: 'Сценарий 15-секундного видео',
  reel_script: 'Сценарий Reels',
  tiktok_script: 'Сценарий TikTok',
  photo_brief: 'Бриф на фото',
  push_notice: 'Текст уведомления',
};

export async function GET(request: Request) {
  const ctx = await requireBusinessContext();
  if (!canMarket(ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const campaignId = new URL(request.url).searchParams.get('campaign');
  let query = ctx.supabase.from('content_items')
    .select('id,campaign_id,content_kind,locale,status,body,cta,alt_text,channel,ordinal,source,created_at')
    .eq('business_id', ctx.businessId)
    .order('content_kind').order('locale').order('ordinal')
    .limit(500);
  if (campaignId) query = query.eq('campaign_id', campaignId);
  const { data: items } = await query;

  const { data: campaigns } = await ctx.supabase.from('campaigns')
    .select('id,name').eq('business_id', ctx.businessId).limit(200);
  const nameOf = new Map((campaigns ?? []).map((row) => [row.id, row.name]));

  const stamp = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Материалы QADAM — ${ctx.business.name}`,
    '',
    `Выгружено ${new Date().toLocaleDateString('ru-RU')}. Материалов: ${(items ?? []).length}.`,
    'Публикация ручная: QADAM готовит тексты и сценарии, но не выкладывает их за вас.',
    '',
  ];

  for (const item of items ?? []) {
    lines.push(`## ${KIND_TITLES[item.content_kind] ?? item.content_kind}${item.content_kind === 'story' ? ` ${item.ordinal}` : ''} · ${item.locale.toUpperCase()}`);
    lines.push('');
    lines.push(`Кампания: ${nameOf.get(item.campaign_id ?? '') ?? 'без кампании'} · статус: ${item.status} · автор: ${item.source === 'provider' ? 'модель' : 'встроенный шаблон'}`);
    if (item.locale === 'kk') lines.push('');
    if (item.locale === 'kk') lines.push('> Казахский текст не проверен носителем языка — проверьте перед публикацией.');
    lines.push('');
    lines.push(item.body);
    if (item.cta) { lines.push(''); lines.push(`**Призыв:** ${item.cta}`); }
    if (item.alt_text) { lines.push(''); lines.push(`**Alt text:** ${item.alt_text}`); }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  await ctx.supabase.from('activity_logs').insert({
    business_id: ctx.businessId,
    actor_id: ctx.userId,
    action: 'content.exported',
    resource_type: 'content_item',
    resource_id: campaignId ?? ctx.businessId,
    metadata: { items: (items ?? []).length, campaign: campaignId, exported_at: new Date().toISOString() },
    is_mock: ctx.business.mode === 'demo',
  });

  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="qadam-content-${stamp}.md"`,
      'cache-control': 'no-store',
    },
  });
}
