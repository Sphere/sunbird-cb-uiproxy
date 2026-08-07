/**
 * Direct unit coverage for createSearchPgPool, shared by publicSearch.ts
 * and ratingsSearch.ts (CHANGE 20). Only reached indirectly through those
 * two files' own tests before this file existed. `pg` is mocked because
 * `new Pool(...)` would otherwise attempt a real connection at
 * construction time.
 */

jest.mock('pg', () => ({ Pool: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    POSTGRES_DATABASE: 'search_db',
    POSTGRES_HOST: 'pg.test',
    POSTGRES_PASSWORD: 'pg-pass',
    POSTGRES_PORT: '5432',
    POSTGRES_USER: 'pg-user',
  },
}))

import { Pool } from 'pg'
import { createSearchPgPool } from './searchPgPool'

const MockPool = Pool as unknown as jest.Mock

beforeEach(() => {
  MockPool.mockClear()
})

describe('createSearchPgPool', () => {
  it('constructs a Pool with the CONSTANTS.POSTGRES_* config', () => {
    createSearchPgPool()

    expect(MockPool).toHaveBeenCalledWith({
      database: 'search_db',
      host: 'pg.test',
      password: 'pg-pass',
      port: 5432,
      user: 'pg-user',
    })
  })

  it('coerces a string port to a number', () => {
    createSearchPgPool()

    const [config] = MockPool.mock.calls[0]
    expect(typeof config.port).toBe('number')
  })

  it('returns a distinct Pool instance on each call — no module-level caching/singleton', () => {
    const first = createSearchPgPool()
    const second = createSearchPgPool()

    expect(MockPool).toHaveBeenCalledTimes(2)
    expect(first).not.toBe(second)
  })
})
