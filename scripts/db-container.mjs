import { readFileSync } from 'node:fs';

/**
 * The name of the local Postgres container.
 *
 * The Supabase CLI derives it from `project_id` in supabase/config.toml, so
 * that file is the only place it is written down. Guessing it from the
 * directory or the repository name works right up until a checkout is named
 * something else — which is exactly what happened in CI, where the job
 * assembled `supabase_db_<repo name>` and then failed with "No such container"
 * on every database assertion.
 *
 * `QADAM_DB_CONTAINER` still overrides, for a tunnel or a renamed container.
 */
export function dbContainer(configPath = 'supabase/config.toml') {
  if (process.env.QADAM_DB_CONTAINER) return process.env.QADAM_DB_CONTAINER;

  let projectId;
  try {
    projectId = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(configPath, 'utf8'))?.[1];
  } catch {
    projectId = undefined;
  }
  if (!projectId) {
    throw new Error(`Could not read project_id from ${configPath}. Set QADAM_DB_CONTAINER to name the container explicitly.`);
  }
  return `supabase_db_${projectId}`;
}
