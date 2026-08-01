import Link from 'next/link';
import { requestPasswordReset } from '@/app/auth/actions';

export default function ForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-background p-4"><form action={requestPasswordReset} className="w-full max-w-md space-y-5 rounded-3xl border bg-surface p-8"><h1 className="text-2xl font-extrabold">Восстановление доступа</h1><p className="text-sm text-muted-foreground">Отправим безопасную ссылку для смены пароля.</p><label className="grid gap-2 text-sm font-bold">Email<input name="email" type="email" required className="min-h-11 rounded-xl border bg-surface-muted px-4 font-normal" /></label><button className="min-h-11 w-full rounded-xl bg-primary px-5 font-bold text-primary-foreground">Отправить ссылку</button><Link href="/login" className="block text-center text-sm text-primary">Вернуться ко входу</Link></form></main>;
}
