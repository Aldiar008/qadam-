import Image from 'next/image';
import Link from 'next/link';
import QRCode from 'qrcode';
import { RefreshCw, ShieldAlert, KeyRound, ArrowRight } from 'lucide-react';
import { DemoBadge } from '@/components/common/DemoBadge';
import { canManage, getLoyaltyData } from '@/server/qadam/repository';
import { createLoyaltyProgram, rotateQrCode, revokeQrCode } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; token?: string; program?: string; rotated?: string; revoked?: string; error?: string }>;
}) {
  const params = await searchParams;
  const data = await getLoyaltyData();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const qrUrl = params.token ? `${origin}/q/${encodeURIComponent(params.token)}` : null;
  const qrImage = qrUrl ? await QRCode.toDataURL(qrUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' }) : null;
  const activeProgram = data.programs.find((p) => p.status === 'active');
  const isManager = canManage(data.role);
  const errorLabels: Record<string, string> = {
    no_active_program: 'Сначала создайте активную программу лояльности.',
    qr_not_selected: 'QR-код не выбран.',
    qr_already_revoked: 'Этот QR уже отозван.',
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">QR-лояльность</h1>
            {data.business.mode === 'demo' && <DemoBadge label="DEMO QR" />}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Opaque token, rotation & revoke, separate consent, append-only ledger и atomic redeem.
          </p>
        </div>
        <Link
          href="/app/customers"
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold hover:bg-surface-muted"
        >
          Открыть Mini-CRM
        </Link>
      </header>

      {(params.error || params.revoked) && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-2xl border p-4 text-sm font-semibold ${
            params.error ? 'border-rose-500/30 bg-rose-500/5 text-rose-800' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800'
          }`}
        >
          {params.error ? (errorLabels[params.error] ?? `Действие отклонено сервером: ${params.error}`) : 'QR-код отозван. Старый токен больше не работает.'}
        </div>
      )}

      {/* QR Code Banner */}
      {qrImage && qrUrl && (
        <section className="grid gap-6 rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:grid-cols-[320px_1fr]">
          <Image
            src={qrImage}
            alt="QR-код программы лояльности"
            width={320}
            height={320}
            unoptimized
            className="rounded-2xl bg-white shadow-md"
          />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <DemoBadge label={data.business.mode === 'demo' ? 'DEMO DATA' : 'ACTIVE QR'} />
              {params.rotated && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-800">
                  QR сгенерирован заново (Rotated)
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold">Публичный QR для кассы</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Токен показывается вам один раз. В базе хранится только SHA-256 hash. При сканировании клиент получает
              отдельные переключатели лояльности и маркетинга.
            </p>
            <a
              href={qrUrl}
              target="_blank"
              rel="noreferrer"
              className="block break-all rounded-xl bg-surface p-3 font-mono text-xs text-primary underline"
            >
              {qrUrl}
            </a>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={qrUrl}
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110"
              >
                Открыть customer flow <ArrowRight className="size-4" />
              </Link>

              {isManager && activeProgram && (
                <form action={rotateQrCode}>
                  <input type="hidden" name="programId" value={params.program ?? activeProgram.id} />
                  <input type="hidden" name="expiryDays" value="365" />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-xs font-bold hover:bg-surface-muted"
                  >
                    <RefreshCw className="size-3.5" /> Ротировать токен
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Security & Management Controls */}
      <section className="rounded-3xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <KeyRound className="size-4" /> Управление токеном и безопасность
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Ротация и отзыв (QR Rotation &amp; Revoke)</h3>
            <p className="text-xs text-muted-foreground">
              Ротация атомарна: прежний join-QR программы получает статус <code className="font-mono">rotated</code>,
              новый opaque-токен показывается один раз.
            </p>
          </div>

          {isManager && activeProgram && (
            <form action={rotateQrCode} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="rotate-program">Программа</label>
              <select
                id="rotate-program"
                name="programId"
                defaultValue={activeProgram.id}
                className="min-h-10 rounded-xl border border-border bg-surface-muted px-3 text-xs font-semibold"
              >
                {data.programs.filter((program) => program.status === 'active').map((program) => (
                  <option key={program.id} value={program.id}>{program.name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="rotate-expiry">Срок действия</label>
              <select id="rotate-expiry" name="expiryDays" defaultValue="365" className="min-h-10 rounded-xl border border-border bg-surface-muted px-3 text-xs font-semibold">
                <option value="1">24 часа</option>
                <option value="7">7 дней</option>
                <option value="30">30 дней</option>
                <option value="365">1 год</option>
              </select>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-xs font-bold text-primary hover:bg-primary/20"
              >
                <RefreshCw className="size-3.5" /> Сгенерировать новый QR
              </button>
            </form>
          )}
        </div>

        {/* QR token registry — one row per issued token */}
        {data.qrTokens.length ? (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Выпущенные QR-токены программы лояльности</caption>
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-semibold">Программа</th>
                  <th scope="col" className="p-3 font-semibold">Создан</th>
                  <th scope="col" className="p-3 font-semibold">Статус</th>
                  <th scope="col" className="p-3 font-semibold">Истекает</th>
                  <th scope="col" className="p-3 font-semibold">Сканы / joins</th>
                  <th scope="col" className="p-3 font-semibold">Последний скан</th>
                  <th scope="col" className="p-3 font-semibold">Действие</th>
                </tr>
              </thead>
              <tbody>
                {data.qrTokens.map((token) => (
                  <tr key={token.id} className="border-t border-border">
                    <td className="p-3 font-semibold">{token.programName}</td>
                    <td className="p-3 font-mono text-xs">{new Date(token.created_at).toLocaleString('ru-RU')}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          token.effectiveStatus === 'active'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : token.effectiveStatus === 'revoked'
                              ? 'bg-rose-500/10 text-rose-700'
                              : 'bg-surface-muted text-muted-foreground'
                        }`}
                      >
                        {token.effectiveStatus}
                      </span>
                      {token.rotated_from_id && <span className="ml-2 text-xs text-muted-foreground">ротация</span>}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {token.expires_at ? new Date(token.expires_at).toLocaleDateString('ru-RU') : 'бессрочно'}
                    </td>
                    <td className="p-3 font-mono text-xs">{token.scanCount} / {token.joinCount}</td>
                    <td className="p-3 font-mono text-xs">
                      {token.lastScanAt ? new Date(token.lastScanAt).toLocaleString('ru-RU') : '—'}
                    </td>
                    <td className="p-3">
                      {isManager && token.effectiveStatus === 'active' ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={rotateQrCode}>
                            <input type="hidden" name="qrId" value={token.id} />
                            <input type="hidden" name="programId" value={token.loyalty_program_id ?? ''} />
                            <input type="hidden" name="expiryDays" value="365" />
                            <button className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold hover:bg-surface-muted">
                              <RefreshCw className="size-3.5" /> Ротировать
                            </button>
                          </form>
                          <form action={revokeQrCode}>
                            <input type="hidden" name="qrId" value={token.id} />
                            <button className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-700 hover:bg-rose-500/20">
                              <ShieldAlert className="size-3.5" /> Отозвать
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            QR-токены ещё не выпущены. Создайте программу лояльности — вместе с ней будет выпущен первый QR.
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Create Program Form */}
        {isManager && (
          <form action={createLoyaltyProgram} className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">Новая программа</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Название
                <input name="name" required defaultValue="TAMYR Loyalty" className="min-h-11 rounded-xl bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Тип
                <select name="programType" className="min-h-11 rounded-xl bg-surface-muted px-4 text-sm">
                  <option value="stamps">Stamps (Штампы)</option>
                  <option value="points">Points (Баллы)</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Начисление при join
                <input name="earn" type="number" min="1" defaultValue="1" className="min-h-11 rounded-xl bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Награда RU
                <input name="rewardNameRu" required defaultValue="Круассан в подарок" className="min-h-11 rounded-xl bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Награда KK
                <input name="rewardNameKk" required defaultValue="Круассан сыйлық" className="min-h-11 rounded-xl bg-surface-muted px-4 text-sm" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Стоимость награды
                <input name="rewardCost" type="number" min="1" defaultValue="6" className="min-h-11 rounded-xl bg-surface-muted px-4 text-sm" />
              </label>
              <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
                Создать программу и QR
              </button>
            </div>
          </form>
        )}

        {/* Existing Programs & Activity History */}
        <section className="rounded-3xl border border-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Программы и награды</h2>
            <div className="mt-4 grid gap-3">
              {data.programs.map((program) => (
                <article key={program.id} className="rounded-2xl bg-surface-muted p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <strong>{program.name}</strong>
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary uppercase">
                      {program.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Тип: {program.program_type}. Награды:{' '}
                    {data.rewards
                      .filter((item) => item.loyalty_program_id === program.id)
                      .map((item) => item.name_ru)
                      .join(', ') || 'нет'}
                  </p>
                </article>
              ))}
              {!data.programs.length && <p className="text-sm text-muted-foreground">Программ пока нет.</p>}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg">История событий (Activity History)</h3>
            <div className="mt-3 grid gap-2 max-h-80 overflow-y-auto pr-1">
              {data.activities.map((event) => (
                <div key={event.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-xs">
                  <span className="font-mono font-bold text-primary">{event.action}</span>
                  <span className="text-muted-foreground">{new Date(event.occurred_at).toLocaleString('ru-RU')}</span>
                </div>
              ))}
              {!data.activities.length && <p className="text-xs text-muted-foreground">Событий пока нет.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
