import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    // `tmp/` holds throwaway probes and shell harnesses, not shipped code.
    ignores: ['.next/**', 'node_modules/**', 'supabase/.temp/**', 'next-env.d.ts', 'tmp/**', 'tests/e2e/results/**'],
  },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
