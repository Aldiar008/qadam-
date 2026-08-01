import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const forbiddenNames = ['NEXT_PUBLIC_SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'];
const clientDirective = /^\s*['"]use client['"];?/m;
const secretImport = /(?:from\s+['"].*supabase\/admin['"]|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)/;
const failures = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(?:ts|tsx|js|mjs|json|env|example)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      for (const forbidden of forbiddenNames) if (text.includes(forbidden) && !path.endsWith(join('scripts', 'check-client-secrets.mjs'))) failures.push(`${relative(root,path)} contains ${forbidden}`);
      if (clientDirective.test(text) && secretImport.test(text)) failures.push(`${relative(root,path)} imports/references a server secret from a Client Component`);
    }
  }
}
walk(join(root, 'src'));
walk(join(root, '.next', 'static'));
const envExample = readFileSync(join(root, '.env.example'), 'utf8');
if (!envExample.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) failures.push('.env.example must use a publishable key');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('PASS: no Supabase secret/service key is exposed to Client Components or browser assets.');
