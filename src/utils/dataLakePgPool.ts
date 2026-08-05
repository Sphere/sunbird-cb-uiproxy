import { Pool } from 'pg'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

/**
 * Builds a Postgres connection pool for the data-lake database, using the
 * same timeouts and pool-size limits every org-signup route already relies
 * on, and wires up the standard error/connect/remove logging.
 *
 * Each caller gets its own pool instance — this only removes the need to
 * repeat the config and logging wiring in every file.
 */
export function createDataLakePgPool() {
  const pool = new Pool({
    connectionTimeoutMillis: 10000, // 10 seconds to establish connection
    database: CONSTANTS.DATA_LAKE_POSTGRES_DATABASE,
    host: CONSTANTS.DATA_LAKE_POSTGRES_HOST,
    idleTimeoutMillis: 30000, // 30 seconds idle before closing
    max: 20, // Max 20 connections in pool
    password: CONSTANTS.DATA_LAKE_POSTGRES_PASSWORD,
    port: Number(CONSTANTS.DATA_LAKE_POSTGRES_PORT),
    statement_timeout: 30000, // 30 seconds for query execution
    user: CONSTANTS.DATA_LAKE_POSTGRES_USER,
  })

  pool.on('error', (error) => {
    logError('Unexpected error on idle client in pool', JSON.stringify(error))
  })

  pool.on('connect', () => {
    logInfo('New PostgreSQL connection established')
  })

  pool.on('remove', () => {
    logInfo('PostgreSQL connection removed from pool')
  })

  return pool
}
