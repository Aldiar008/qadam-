import { updatePassword } from '@/app/auth/actions';

export default function ResetPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-background p-4"><form action={updatePassword} className="w-full max-w-md space-y-5 rounded-3xl border bg-surface p-8"><h1 className="text-2xl font-extrabold">Новый пароль</h1><label className="grid gap-2 text-sm font-bold">Пароль<input name="password" type="password" minLength={8} required className="min-h-11 rounded-xl border bg-surface-muted px-4 font-normal" /></label><button className="min-h-11 w-full rounded-xl bg-primary px-5 font-bold text-primary-foreground">Сохранить пароль</button></form></main>;
}
