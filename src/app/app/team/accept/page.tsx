import { acceptInvitation } from '../actions';

export const dynamic = 'force-dynamic';

/** Accepting requires a signed-in user and a valid, unexpired, unrevoked token. */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Приглашение в команду</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Приняв приглашение, вы получите доступ к кабинету заведения с той ролью, которую указал
        пригласивший. Роль и срок действия проверяются на сервере.
      </p>
      <form action={acceptInvitation} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
        <label className="grid gap-1 text-sm font-semibold">
          Код приглашения
          <input name="token" required defaultValue={params.token} className="min-h-11 rounded-xl border border-border bg-surface-muted px-3 font-mono text-xs font-normal" />
        </label>
        <button className="min-h-12 w-full rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground">
          Принять приглашение
        </button>
      </form>
    </div>
  );
}
