import { Signal, GrowthContract } from '@/types';

export const mockTodaySignal: Signal = {
  id: 'sig-001',
  titleRu: 'Снижение выручки в будни 15:00–18:00 на 27%',
  titleKk: 'Жұмыс күндері 15:00–18:00 аралығында түсім 27%-ға төмендеді',
  metricChange: '-27%',
  severity: 'opportunity',
  growthScore: 87,
  affectedCustomersCount: 64,
  detectedAt: 'Сегодня, 10:15',
  timeWindow: 'Пн-Пт 15:00–18:00',
  category: 'Выручка в тихие часы',
};

export const mockGrowthContract: GrowthContract = {
  id: 'gc-101',
  signalId: 'sig-001',
  titleRu: 'Счастливый час + подарок при чеке от 3 500 ₸',
  titleKk: 'Бақытты сағат + 3 500 ₸ чек үшін сыйлық',
  signalDescriptionRu: '64 постоянных клиента перестали заходить в тихие часы 15:00–18:00.',
  signalDescriptionKk: '64 тұрақты клиент 15:00–18:00 тыныш сағаттарында келуді тоқтатты.',
  reasonRu: 'Средний чек снижается из-за отсутствия специальных предложений в обеденный спад.',
  reasonKk: 'Түскі астан кейінгі баяу уақытта арнайы ұсыныстардың болмауынан орташа чек төмендейді.',
  confidenceScore: 94,
  targetGoal: 'Заполнить тихие часы 15:00–18:00 и повысить средний чек до 3 500 ₸',
  targetAudience: '18 релевантных клиентов из сегмента «Спящие постоянники»',
  offerDescriptionRu: 'Свежий круассан в подарок при чеке от 3 500 ₸ в будни с 15:00 до 18:00',
  offerDescriptionKk: 'Жұмыс күндері 15:00-ден 18:00-ге дейін 3 500 ₸-ден басталатын чекке жаңа круассан сыйлыққа',
  economics: {
    minCheck: 3500,
    giftCost: 450,
    marginBeforePercent: 62,
    marginAfterPercent: 49.1,
    projectedIncrementalRevenue: 48700,
    projectedContributionProfit: 18200,
  },
  channel: 'WhatsApp',
  validityDays: 7,
  stopRule: 'Автоматическая остановка при погашении 15 купонов или исчерпании бюджета 7 000 ₸',
  measurementMethod: 'Сравнение выручки 18 целевых клиентов с контрольной группой без оффера',
};
