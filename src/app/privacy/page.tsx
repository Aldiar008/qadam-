import { createAdminClient } from '@/lib/supabase/admin';
import { GlobalHeader } from '@/components/navigation/GlobalHeader';
import { Footer } from '@/components/navigation/Footer';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';

export const dynamic = 'force-dynamic';

/**
 * Privacy page.
 *
 * The inventory and retention tables below are read from the database, not
 * written by hand, so the page describes what the system actually stores rather
 * than what someone once intended it to store.
 */

const CLASSIFICATION_LABELS: Record<string, string> = {
  identifier: 'Идентификатор',
  quasi_identifier: 'Косвенный идентификатор',
  contact: 'Контакт',
  behavioural: 'Поведение',
  financial: 'Финансы',
  operational: 'Операционные данные',
  secret_reference: 'Ссылка на секрет',
};

const STORAGE_LABELS: Record<string, string> = {
  plaintext: 'в открытом виде',
  masked: 'замаскировано',
  hashed: 'хэш',
  rounded: 'округлено',
  derived: 'вычисляется',
  absent: 'не хранится',
};

const BASIS_LABELS: Record<string, string> = {
  consent: 'согласие',
  contract: 'исполнение договора',
  legal_obligation: 'требование закона',
  legitimate_interest: 'законный интерес',
};

export default async function PrivacyPage() {
  const db = createAdminClient();
  const [{ data: inventory }, { data: retention }] = await Promise.all([
    db.from('data_inventory').select('table_name,column_name,classification,contains_pii,storage_form,lawful_basis').order('table_name'),
    db.from('retention_policies').select('record_type,category,contains_pii,retain_days,anonymize_instead_of_delete,lawful_basis').order('category'),
  ]);

  const piiColumns = (inventory ?? []).filter((row) => row.contains_pii);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-background text-foreground">
      <GlobalHeader />

      <main id="main-content" tabIndex={-1} className="flex-grow pb-20 pt-28 outline-none">
        <div className="container mx-auto max-w-4xl space-y-10 px-4 sm:px-6">
          <Breadcrumbs items={[{ label: 'Политика конфиденциальности' }]} />

          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold">Политика конфиденциальности</h1>
            <p className="font-mono text-xs text-muted-foreground">Обновлено: 1 августа 2026 г.</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Ниже описано фактическое поведение системы, а не намерения. Таблицы состава данных и
              сроков хранения читаются из самой базы, поэтому расхождение между текстом и кодом
              обнаруживается автоматическими проверками.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Что мы храним</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Персональных полей — {piiColumns.length}. Контакт клиента хранится как необратимый хэш
              для поиска и как маска для узнавания владельцем; полный email или телефон в базе
              не сохраняется.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Состав хранимых данных</caption>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3 font-semibold">Поле</th>
                    <th scope="col" className="p-3 font-semibold">Категория</th>
                    <th scope="col" className="p-3 font-semibold">ПДн</th>
                    <th scope="col" className="p-3 font-semibold">Форма хранения</th>
                    <th scope="col" className="p-3 font-semibold">Основание</th>
                  </tr>
                </thead>
                <tbody>
                  {(inventory ?? []).map((row) => (
                    <tr key={`${row.table_name}.${row.column_name}`} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{row.table_name}.{row.column_name}</td>
                      <td className="p-3 text-xs">{CLASSIFICATION_LABELS[row.classification] ?? row.classification}</td>
                      <td className="p-3 text-xs">{row.contains_pii ? 'да' : 'нет'}</td>
                      <td className="p-3 text-xs">{STORAGE_LABELS[row.storage_form] ?? row.storage_form}</td>
                      <td className="p-3 text-xs">{BASIS_LABELS[row.lawful_basis] ?? row.lawful_basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Сколько мы храним</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Финансовые и аудиторские записи нельзя удалить по требованию: они хранятся
              обезличенными, потому что закон обязывает сохранять историю операций. Всё остальное
              удаляется полностью.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Сроки хранения по типам записей</caption>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3 font-semibold">Тип записи</th>
                    <th scope="col" className="p-3 font-semibold">Срок</th>
                    <th scope="col" className="p-3 font-semibold">При удалении</th>
                    <th scope="col" className="p-3 font-semibold">Основание</th>
                  </tr>
                </thead>
                <tbody>
                  {(retention ?? []).map((row) => (
                    <tr key={row.record_type} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{row.record_type}</td>
                      <td className="p-3 text-xs">
                        {row.retain_days == null
                          ? 'до отзыва согласия'
                          : `${Math.round((row.retain_days / 365) * 10) / 10} года (${row.retain_days} дн.)`}
                      </td>
                      <td className="p-3 text-xs">{row.anonymize_instead_of_delete ? 'обезличивается' : 'удаляется'}</td>
                      <td className="p-3 text-xs">{BASIS_LABELS[row.lawful_basis] ?? row.lawful_basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Ваши права</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>
                <strong className="text-foreground">Экспорт.</strong> Отсканируйте QR заведения и запросите выгрузку.
                Ссылка подписывается и истекает; повторное скачивание требует нового запроса.
              </li>
              <li>
                <strong className="text-foreground">Удаление.</strong> Контакты и заметки стираются, профиль
                обезличивается, клиент попадает в список исключений. Суммы прошлых покупок остаются
                без привязки к человеку.
              </li>
              <li>
                <strong className="text-foreground">Отзыв согласия.</strong> Действует немедленно: проверка
                выполняется прямо перед каждой отправкой, а не при формировании списка.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Что видит администратор платформы</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Платформенная аналитика построена на агрегатах и не содержит ни одной строки с данными
              клиентов. Срез, в котором меньше пяти бизнесов, скрывается целиком, чтобы по цифрам
              нельзя было опознать конкретное заведение. Журналы и трассировки AI хранят только
              отредактированный ввод и его SHA-256 хэш.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Резервные копии и восстановление</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Резервное копирование выполняется средствами управляемой базы Supabase: ежедневный
              снимок с хранением 7 дней и point-in-time recovery. Запрос на удаление применяется
              к рабочей базе немедленно; в снимках данные исчезают по мере ротации, максимум через
              7 дней. Процедура восстановления и её проверка описаны в RUNBOOK.
            </p>
          </section>

          <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
            <h2 className="text-lg font-bold text-amber-900">Юридическая проверка не проводилась</h2>
            <p className="mt-2 text-sm leading-6">
              Этот документ подготовлен командой разработки и описывает техническое поведение системы.
              Соответствие Закону РК «О персональных данных и их защите» и требованиям других
              юрисдикций <strong>не проверял квалифицированный юрист</strong>. Такая проверка отмечена
              как обязательное внешнее условие релиза и должна быть выполнена до коммерческого запуска.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
