import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseInquiries, type InquiryRow } from '../inquiry-analytics.ts';

const NOW = Date.UTC(2026, 7, 4, 12, 0, 0);
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const row = (over: Partial<InquiryRow> = {}): InquiryRow => ({
  category: 'menu', sentiment: 'neutral', status: 'auto_answered',
  occurredAt: at(120), answeredAt: at(119), answeredBy: 'ai', ...over,
});

test('пустой период говорит об этом, а не рисует нули как вывод', () => {
  const summary = summariseInquiries({ rows: [], windowDays: 7 });
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.conclusions, ['За выбранный период гости ничего не писали.']);
});

test('доли автоответа и передачи владельцу в сумме дают целое', () => {
  const summary = summariseInquiries({
    rows: [row(), row(), row({ answeredBy: 'owner', status: 'answered' }), row({ answeredBy: null, answeredAt: null, status: 'awaiting_owner' })],
    windowDays: 7,
  });
  assert.equal(summary.total, 4);
  assert.equal(summary.autoAnsweredShareBps, 5000);
  assert.equal(summary.escalatedShareBps, 5000);
  assert.equal(summary.autoAnsweredShareBps + summary.escalatedShareBps, 10_000);
  assert.equal(summary.waiting, 1);
  assert.equal(summary.answered, 3);
});

test('время ответа считается медианой, а не средним', () => {
  const summary = summariseInquiries({
    rows: [
      row({ answeredBy: 'owner', occurredAt: at(100), answeredAt: at(90) }),   // 10 мин
      row({ answeredBy: 'owner', occurredAt: at(100), answeredAt: at(80) }),   // 20 мин
      row({ answeredBy: 'owner', occurredAt: at(5000), answeredAt: at(100) }), // 81 ч — выброс
    ],
    windowDays: 7,
  });
  // Среднее было бы больше суток; медиана называет то, что гость видит обычно.
  assert.equal(summary.medianOwnerReplyMinutes, 20);
});

test('самая частая тема названа числом, а не эпитетом', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => row({ category: 'complaint', sentiment: 'negative', answeredBy: 'owner' })),
    ...Array.from({ length: 4 }, () => row({ category: 'menu' })),
  ];
  const summary = summariseInquiries({ rows, windowDays: 7 });
  assert.equal(summary.topCategories[0].category, 'complaint');
  assert.equal(summary.topCategories[0].shareBps, 6000);
  assert.ok(summary.conclusions.some((line) => line.includes('60%') && line.includes('6 из 10')));
});

test('сравнение с прошлым периодом делается только когда есть с чем сравнивать', () => {
  const complaints = Array.from({ length: 5 }, () => row({ category: 'complaint' }));
  const calm = Array.from({ length: 5 }, () => row({ category: 'menu' }));

  const noBase = summariseInquiries({ rows: complaints, previous: [row()], windowDays: 7 });
  assert.equal(noBase.complaintChangeBps, null, 'по одному обращению вывода о динамике не делается');

  const grew = summariseInquiries({ rows: complaints, previous: calm, windowDays: 7 });
  assert.equal(grew.complaintChangeBps, 10_000);
  assert.ok(grew.conclusions.some((line) => line.includes('выросла')));

  const fell = summariseInquiries({ rows: calm, previous: complaints, windowDays: 7 });
  assert.equal(fell.complaintChangeBps, -10_000);
  assert.ok(fell.conclusions.some((line) => line.includes('снизилась')));
});

test('когда ассистент не ответил ни разу, это сказано прямо', () => {
  const summary = summariseInquiries({
    rows: Array.from({ length: 4 }, () => row({ answeredBy: 'owner', status: 'answered' })),
    windowDays: 7,
  });
  assert.equal(summary.autoAnsweredShareBps, 0);
  assert.ok(summary.conclusions.some((line) => line.includes('не ответил сам ни на одно')));
});

test('обращение без темы считается «другим», а не теряется', () => {
  const summary = summariseInquiries({ rows: [row({ category: null }), row({ category: null })], windowDays: 7 });
  assert.equal(summary.topCategories[0].category, 'other');
  assert.equal(summary.topCategories[0].count, 2);
});
