/**
 * Helpers for the two response shapes route handlers actually branch on.
 *
 * Nearly every handler follows:
 *   res.status(response.status).send(response.data)              // success
 *   res.status(err.response.status || 500).send(err.response.data || {...})  // failure
 *
 * so a mocked rejection MUST carry a nested `response` object or the handler
 * takes its 500 fallback branch and the test silently checks the wrong path.
 * `upstreamError()` builds that shape correctly; `networkError()` deliberately
 * omits it, to exercise the fallback.
 *
 * Usage:
 *   jest.mock('axios')
 *   const mockAxios = axios as jest.Mocked<typeof axios>
 *   mockAxios.get.mockResolvedValue(upstreamOk({ hello: 'world' }))
 */

/** A successful axios response. */
// tslint:disable-next-line: no-any
export function upstreamOk(data: any = {}, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} }
}

/**
 * An axios rejection carrying an upstream HTTP response — the branch handlers
 * use to forward the real status code and body.
 */
// tslint:disable-next-line: no-any
export function upstreamError(status = 502, data: any = { error: 'upstream failed' }) {
  const error = new Error(`Request failed with status code ${status}`)
  // tslint:disable-next-line: no-any
  ;(error as any).response = { data, status, statusText: 'Error', headers: {}, config: {} }
  // tslint:disable-next-line: no-any
  ;(error as any).isAxiosError = true
  return error
}

/**
 * A transport-level failure with no upstream response (DNS, timeout, refused).
 * Handlers should fall back to 500 and their generic error body.
 */
export function networkError(message = 'connect ECONNREFUSED') {
  const error = new Error(message)
  // tslint:disable-next-line: no-any
  ;(error as any).isAxiosError = true
  return error
}
