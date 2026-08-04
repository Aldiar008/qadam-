import assert from 'node:assert/strict';
import test from 'node:test';

import { VOCABULARY_CODES, capitalise, vocabularyFor } from '../business-vocabulary.ts';
import { recommendMechanics, profileSummary } from '../tool-recommendations.ts';

test('каждый тип заведения говорит своими словами', () => {
  assert.equal(vocabularyFor('cafe').personOne, 'гость');
  assert.equal(vocabularyFor('retail').personOne, 'покупатель');
  assert.equal(vocabularyFor('dental').personOne, 'пациент');
  assert.equal(vocabularyFor('dental').visitOne, 'приём');
  assert.equal(vocabularyFor('beauty').itemOne, 'услуга');
  assert.equal(vocabularyFor('cafe').catalogue, 'меню');
});

test('незнакомый тип получает нейтральные слова, а не слова кофейни', () => {
  const unknown = vocabularyFor('taxidermy');
  assert.equal(unknown.personOne, 'клиент');
  assert.equal(unknown.visitOne, 'визит');
  assert.equal(vocabularyFor(null).personOne, 'клиент');
  assert.equal(vocabularyFor(undefined).personMany, 'клиенты');
});

test('падежи перечислены, а не достроены из именительного', () => {
  for (const code of VOCABULARY_CODES) {
    const words = vocabularyFor(code);
    assert.ok(words.personGenitive.length > 2, `${code}: пустой родительный падеж`);
    assert.ok(words.visitGenitive.length > 2, `${code}: пустой родительный падеж визита`);
  }
  // «гостьом» и «покупательом» — то, что получилось бы, склоняй мы правилом.
  assert.equal(vocabularyFor('cafe').personInstrumental, 'гостем');
  assert.equal(vocabularyFor('retail').personInstrumental, 'покупателем');
  assert.equal(vocabularyFor('dental').visitGenitive, 'приёмов');
});

test('у каждого словаря заполнены все поля', () => {
  for (const code of VOCABULARY_CODES) {
    const words = vocabularyFor(code);
    for (const [field, value] of Object.entries(words)) {
      if (Array.isArray(value)) {
        assert.ok(value.length > 0, `${code}.${field} пуст`);
        continue;
      }
      assert.ok(String(value).trim().length > 0, `${code}.${field} пуст`);
    }
  }
});

test('стоматология получает свои механики и свою подпись подбора', () => {
  const mechanics = recommendMechanics('dental');
  assert.equal(mechanics.length, 2);
  assert.ok(mechanics.some((item) => /профилактик/i.test(item.title + item.reason)));
  assert.match(profileSummary('dental', 'reactivate'), /стоматологии/);
  // Механики стоматологии не должны совпасть с кофейными.
  assert.notDeepEqual(mechanics, recommendMechanics('cafe'));
});

test('заглавная буква ставится, а остальное слово не трогается', () => {
  assert.equal(capitalise('пациенты'), 'Пациенты');
  assert.equal(capitalise('приём'), 'Приём');
  assert.equal(capitalise(''), '');
});
