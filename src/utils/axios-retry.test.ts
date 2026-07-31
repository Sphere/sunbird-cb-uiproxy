/**
 * axios-retry.ts is a pure module-load side effect: importing it registers
 * a global `axios.interceptors.response` rejection handler — there is no
 * exported function to call directly. To test it without a real network
 * call, the real `axios` package is imported (not mocked, since the
 * interceptor-registration mechanism itself is what's under test), and the
 * registered handler is invoked directly via axios's internal
 * `interceptors.response.handlers[0].rejected`, a standard technique for
 * unit-testing axios interceptors in isolation. `axios.defaults.adapter` is
 * swapped for a jest.fn() so the retry path's recursive `axios(config)`
 * call resolves instantly instead of making a real request.
 */

import axios from 'axios'
import '../models/axios-request-config.model'
import './axios-retry'

// tslint:disable-next-line: no-any
const rejectedHandler = (axios.interceptors.response as any).handlers[0].rejected as (
  // tslint:disable-next-line: no-any
  err: any
  // tslint:disable-next-line: no-any
) => any

describe('axios-retry interceptor', () => {
  it('should reject immediately for a sub-500 response status', async () => {
    const err = { config: { retry: 3 }, response: { status: 404 } }
    await expect(rejectedHandler(err)).rejects.toBe(err)
  })

  it('should reject immediately when the request config has no retry option', async () => {
    const err = { config: { retry: 0 }, response: { status: 500 } }
    await expect(rejectedHandler(err)).rejects.toBe(err)
  })

  it('should reject immediately when there is no config at all', async () => {
    const err = { config: undefined, response: { status: 500 } }
    await expect(rejectedHandler(err)).rejects.toBe(err)
  })

  it("should reject with a '404' code once the retry count is exhausted", async () => {
    // tslint:disable-next-line: no-any
    const err: any = { config: { __retryCount: 3, retry: 3 }, response: { status: 500 } }
    await expect(rejectedHandler(err)).rejects.toBe(err)
    expect(err.code).toBe('404')
  })

  it('should retry the request via axios(config) when retries remain, then resolve', async () => {
    const mockAdapter = jest.fn().mockResolvedValue({
      config: {},
      data: { ok: true },
      headers: {},
      status: 200,
      statusText: 'OK',
    })
    const originalAdapter = axios.defaults.adapter
    axios.defaults.adapter = mockAdapter

    // tslint:disable-next-line: no-any
    const config: any = { retry: 3, retryDelay: 0 }
    const err = { config, response: { status: 500 } }

    const result = await rejectedHandler(err)

    expect(config.__retryCount).toBe(1)
    expect(mockAdapter).toHaveBeenCalled()
    expect(result.data).toEqual({ ok: true })

    axios.defaults.adapter = originalAdapter
  })

  it('should default the retry delay to 0 when retryDelay is not set', async () => {
    const mockAdapter = jest.fn().mockResolvedValue({
      config: {},
      data: {},
      headers: {},
      status: 200,
      statusText: 'OK',
    })
    const originalAdapter = axios.defaults.adapter
    axios.defaults.adapter = mockAdapter

    const config = { retry: 1 }
    const err = { config, response: { status: 500 } }

    await rejectedHandler(err)

    expect(mockAdapter).toHaveBeenCalled()
    axios.defaults.adapter = originalAdapter
  })
})
