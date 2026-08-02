import { TelegramBridge } from '@/components/telegram/TelegramBridge';

export const dynamic = 'force-dynamic';

/** Entry point: prove the chat, then send the person to their own screen. */
export default function TelegramEntryPage() {
  return <TelegramBridge />;
}
