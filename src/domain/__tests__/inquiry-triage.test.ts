import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALWAYS_NEEDS_A_PERSON, DEFAULT_POLICY, INQUIRY_CATEGORIES, CATEGORY_LABELS,
  classifyInquiry, decideAnswer, resolvePolicy, isInquiryCategory,
} from '../inquiry-triage.ts';

const triageOf = (text: string) => classifyInquiry(text);

test('бытовые вопросы узнаются по теме', () => {
  assert.equal(triageOf('Во сколько вы открываетесь в субботу?').category, 'hours');
  assert.equal(triageOf('Сколько стоит капучино?').category, 'menu');
  assert.equal(triageOf('Можно оплатить картой при доставке?').category, 'order');
  assert.equal(triageOf('Хочу забронировать столик на двоих').category, 'booking');
  assert.equal(triageOf('А у вас есть парковка рядом?').category, 'hours');
});

test('благодарность, отзыв и предложение не путаются друг с другом', () => {
  assert.equal(triageOf('Спасибо, всё было очень вкусно!').category, 'gratitude');
  assert.equal(triageOf('Предлагаю добавить безлактозное молоко').category, 'suggestion');
  assert.equal(triageOf('Оставлю отзыв: обслуживание на высоте').category, 'review');
  assert.equal(triageOf('Спасибо, всё было очень вкусно!').sentiment, 'positive');
});

test('жалоба помечается негативной и срочной', () => {
  const cold = triageOf('Кофе сегодня был холодный');
  assert.equal(cold.category, 'complaint');
  assert.equal(cold.sentiment, 'negative');
  assert.equal(cold.urgency, 2);

  const loud = triageOf('Жду заказ уже час, до сих пор ничего!');
  assert.equal(loud.urgency, 3, 'слова о времени поднимают срочность');
  assert.ok(loud.matched.length > 0, 'разбор обязан назвать, по каким словам он решил');
});

test('деньги выигрывают у жалобы: решение здесь денежное', () => {
  const refund = triageOf('Верните деньги за холодный кофе');
  assert.equal(refund.category, 'money');
  assert.equal(refund.sentiment, 'negative');
});

test('вопрос об оплате картой — это не денежное решение', () => {
  // «Оплатить картой» и «верните деньги» — разные вещи, и путать их дорого:
  // первое ассистент отвечает сам, второе не отвечает никогда.
  assert.equal(triageOf('Вы принимаете Kaspi?').category, 'order');
  assert.notEqual(triageOf('Можно ли оплатить картой?').category, 'money');
});

test('непонятное остаётся вопросом или «другим», а не выдуманной темой', () => {
  assert.equal(triageOf('А как у вас вообще?').category, 'question');
  assert.equal(triageOf('.').category, 'other');
});

// ---------------------------------------------------------------------------
// Кто имеет право ответить
// ---------------------------------------------------------------------------

test('жалобы и деньги не переводятся на автомат никакой настройкой', () => {
  for (const category of ALWAYS_NEEDS_A_PERSON) {
    assert.equal(resolvePolicy(category, { [category]: 'auto' }), 'approve',
      `${category} обязан требовать человека даже при настройке auto`);
    assert.equal(DEFAULT_POLICY[category], 'approve');
  }
});

test('владелец может ужесточить правило по любой теме', () => {
  assert.equal(resolvePolicy('menu'), 'auto');
  assert.equal(resolvePolicy('menu', { menu: 'approve' }), 'approve');
  assert.equal(resolvePolicy('review'), 'approve');
  assert.equal(resolvePolicy('review', { review: 'auto' }), 'auto');
});

test('ассистент отвечает сам на разрешённую тему с готовым черновиком', () => {
  const decision = decideAnswer({
    ownTriage: triageOf('Во сколько открываетесь?'), needsHuman: false, hasDraft: true,
  });
  assert.equal(decision.automatic, true);
  assert.equal(decision.category, 'hours');
  assert.match(decision.reason, /разрешён вашими настройками/);
});

test('нет фактов — нет автоответа, даже если тема разрешена', () => {
  const decision = decideAnswer({
    ownTriage: triageOf('Во сколько открываетесь?'), needsHuman: true, hasDraft: true,
  });
  assert.equal(decision.automatic, false);
  assert.match(decision.reason, /нет ответа на этот вопрос/);
});

test('пустой черновик не отправляется', () => {
  const decision = decideAnswer({
    ownTriage: triageOf('Во сколько открываетесь?'), needsHuman: false, hasDraft: false,
  });
  assert.equal(decision.automatic, false);
});

test('из двух версий темы побеждает та, что требует человека', () => {
  // Модель решила, что это вопрос о меню; свой разбор увидел возврат денег.
  const strict = decideAnswer({
    ownTriage: triageOf('Верните деньги, кофе был холодный'),
    modelCategory: 'menu', needsHuman: false, hasDraft: true,
  });
  assert.equal(strict.automatic, false);
  assert.equal(strict.category, 'money');

  // И наоборот: свой разбор ничего не понял, модель распознала жалобу.
  const alsoStrict = decideAnswer({
    ownTriage: triageOf('ну такое'),
    modelCategory: 'complaint', needsHuman: false, hasDraft: true,
  });
  assert.equal(alsoStrict.automatic, false);
  assert.equal(alsoStrict.category, 'complaint');
});

test('у каждой темы есть человеческое название и она известна проверке типа', () => {
  for (const category of INQUIRY_CATEGORIES) {
    assert.ok(CATEGORY_LABELS[category].length > 3, `${category} без названия`);
    assert.equal(isInquiryCategory(category), true);
  }
  assert.equal(isInquiryCategory('nonsense'), false);
  assert.equal(isInquiryCategory(null), false);
});
