import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTOMATION_TEMPLATES, allowedModes, describeGuardrails, describeTrigger, findTemplate,
} from '../../automations/catalog.ts';

test('каждое правило названо по-русски и объясняет себя', () => {
  for (const template of AUTOMATION_TEMPLATES) {
    assert.ok(template.nameRu.length > 5, `${template.code} без названия`);
    assert.ok(template.descriptionRu.length > 20, `${template.code} без описания`);
    assert.ok(template.version.startsWith(template.code), `${template.code}: версия должна называть правило`);
    assert.ok(template.autopilotGates.length > 0, `${template.code}: не сказано, что нужно для автопилота`);
  }
});

test('коды правил не повторяются', () => {
  const codes = AUTOMATION_TEMPLATES.map((template) => template.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('новые правила опираются на покупки и меню, а не на редкие поля', () => {
  for (const code of ['second_visit', 'abandoned_item', 'check_drop', 'low_margin_item'] as const) {
    const template = findTemplate(code);
    assert.ok(template, `${code} отсутствует в каталоге`);
    // Ни одно из них не должно быть заблокировано: данные для них есть у любого
    // заведения с кассой — в отличие от дня рождения, которого продукт не собирает.
    assert.equal(template.blockedReason, undefined, `${code} не должно быть заблокировано`);
  }
});

test('только защитное правило работает без присмотра', () => {
  for (const template of AUTOMATION_TEMPLATES) {
    if (template.code === 'stop_loss') {
      assert.equal(template.defaultMode, 'autopilot');
      continue;
    }
    assert.notEqual(template.defaultMode, 'autopilot', `${template.code} не должно стартовать на автопилоте`);
    assert.ok(allowedModes(template).includes('assistant'));
  }
});

test('условие правила читается предложением, а не фигурными скобками', () => {
  const reactivation = findTemplate('reactivation');
  assert.ok(reactivation);
  const sentence = describeTrigger(reactivation.trigger);
  assert.match(sentence, /без визита дольше 30 дней/);
  assert.match(sentence, /раз в сутки/);
  assert.equal(sentence.includes('{'), false);
});

test('незнакомое условие показывается, а не теряется', () => {
  assert.match(describeTrigger({ kind: 'moon_phase' }), /moon_phase/);
  assert.match(describeTrigger({}), /не задано/);
});

test('ограничения перечисляются словами владельца', () => {
  const lines = describeGuardrails({
    requiresConsent: true, respectsQuietHours: true, ownerApprovalRequired: true, maxRecipientsPerRun: 25,
  });
  assert.ok(lines.some((line) => line.includes('согласие')));
  assert.ok(lines.some((line) => line.includes('тихие часы')));
  assert.ok(lines.some((line) => line.includes('25 человек')));
  // Ограничение «не больше одного получателя» — это про уведомление владельцу,
  // и владельцу о нём знать незачем.
  assert.equal(describeGuardrails({ maxRecipientsPerRun: 1 }).length, 0);
});
