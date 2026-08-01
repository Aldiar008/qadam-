'use client';

import React from 'react';
import { PublicPageTemplate } from '@/components/templates/PublicPageTemplate';
import { HeroScene } from '@/components/landing/HeroScene';

export default function CafeSolutionPage() {
  return (
    <PublicPageTemplate
      breadcrumbs={[{ label: 'Для бизнеса', href: '/solutions' }, { label: 'Кофейни и общепит' }]}
      tag="Solution for Coffee & Food"
      titleRu="QADAM для кофеен, пекарен и точек общепита"
      titleKk="Кофеханалар, наубайханалар және қоғамдық тамақтану орындарына арналған QADAM"
      subtitleRu="Заполните провал выручки в будни с 15:00 до 18:00 и поднимите средний чек."
      subtitleKk="Жұмыс күндері 15:00-ден 18:00-ге дейінгі түсімнің төмендеуін толтырыңыз."
      problemRu="Кофейни теряют до 30% потенциальной выручки из-за простоя между обеденным пиком и вечером."
      problemKk="Кофеханалар түскі шын мен кештің арасындағы тоқтап қалу салдарынан 30%-ға дейін түсімді жоғалтады."
      solutionRu="QADAM автоматически находить спад и генерирует комбо-офферы с миндальным круассаном при чеке от 3 500 ₸."
      solutionKk="QADAM бәсеңдеуді автоматты түрде табады және 3 500 ₸ чегіне миндаль круассаны бар комбо-офферлерді генерациялайды."
      featuresRu={[
        'Мониторинг тихих часов 15:00-18:00',
        'Автоматический подарок к чеку от 3 500 ₸',
        'QR-наклейка на каждом столике и кассе',
        'Защита маржинальности десертов',
      ]}
      featuresKk={[
        '15:00-18:00 тыныш сағаттарын мониторингтеу',
        '3 500 ₸ чегіне автоматты сыйлық',
        'Әр үстел мен кассадағы QR-жапсырма',
        'Десерттердің маржиналдылығын қорғау',
      ]}
      mockupNode={<HeroScene />}
      nextFeatureHref="/solutions/beauty"
      nextFeatureLabelRu="Решение для Салонов красоты"
      nextFeatureLabelKk="Сұлулық салондарына арналған шешім"
    />
  );
}
