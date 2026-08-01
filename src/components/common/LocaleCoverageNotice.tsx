import { getDictionary } from '@/lib/dictionary';
import type { Language } from '@/types';

/**
 * Tells a Kazakh-speaking owner the truth about where they are.
 *
 * The locale now resolves and renders on the server, and the shell — navigation,
 * breadcrumbs, headings — follows it. The copy inside individual cabinet screens
 * does not yet: it is still Russian, and translating it is a content task gated
 * on review by a native speaker, which has not happened.
 *
 * Showing Russian text under a Kazakh interface without saying so would be the
 * same class of dishonesty as showing a mock result as a fact. So the product
 * says it, in Kazakh, once, at the top of the cabinet.
 */
export function LocaleCoverageNotice({ locale }: { locale: Language }) {
  if (locale !== 'kk') return null;
  const t = getDictionary(locale);
  return (
    <p
      role="status"
      lang="kk"
      className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-900"
    >
      {t.localeCoverageNotice}
    </p>
  );
}
