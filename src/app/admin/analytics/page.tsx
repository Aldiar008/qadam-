import { redirect } from 'next/navigation';

/** The platform overview is the analytics surface; keep one canonical route. */
export default function AdminAnalyticsPage() {
  redirect('/admin');
}
