import { Pool } from 'pg'
import { CONSTANTS } from './env'

// sonar-cleanup: extracted from publicSearch.ts / ratingsSearch.ts inline `new Pool(...)` (CHANGE 20) — each caller still gets its own pool instance, no shared/singleton pool
/**
 * Builds a Postgres connection pool using the CONSTANTS.POSTGRES_* config
 * shared by publicSearch.ts and ratingsSearch.ts, both of which query the
 * same public.data_node table.
 *
 * Each caller gets its own pool instance — this only removes the need to
 * repeat the config and construction in every file.
 */
export function createSearchPgPool() {
  return new Pool({
    database: CONSTANTS.POSTGRES_DATABASE,
    host: CONSTANTS.POSTGRES_HOST,
    password: CONSTANTS.POSTGRES_PASSWORD,
    port: Number(CONSTANTS.POSTGRES_PORT),
    user: CONSTANTS.POSTGRES_USER,
  })
}
