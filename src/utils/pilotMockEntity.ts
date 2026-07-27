import axios from 'axios'
import _ from 'lodash'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

/**
 * PILOT DEMO ADD-ON - appends a mock entity row at the end of the
 * /getAllEntity list.
 *
 * SWITCH ON/OFF : PILOT_MOCK_ENTITY_ENABLED ('true' to enable, off by default)
 * CHANGE DATA   : replace the json at PILOT_MOCK_ENTITY_URL, no rebuild needed
 * REMOVE FOR GOOD: delete this file, the import + wrapper line in the two
 *                  getAllEntity routes, and the two PILOT_MOCK_ENTITY_* keys
 *                  in utils/env.ts. Nothing else references it.
 *
 * Every check below returns the upstream payload untouched, so this add-on can
 * never turn a working api response into a broken one.
 */

const FETCH_TIMEOUT = 5000
const SUCCESS_RESPONSE_CODE = 200
const ENTITY_LIST_PATH = 'result.response'

/**
 * @param payload     upstream `response.data`
 * @param requestBody incoming `req.body`, used to add the row only to the
 *                    entity type that was actually searched for
 */
// tslint:disable-next-line: no-any
export async function appendPilotMockEntity(payload: any, requestBody: any): Promise<any> {
  try {
    // feature off, or nothing to fetch
    if (!CONSTANTS.PILOT_MOCK_ENTITY_ENABLED || !CONSTANTS.PILOT_MOCK_ENTITY_URL) {
      return payload
    }
    // only successful responses are ever touched
    if (_.get(payload, 'responseCode') !== SUCCESS_RESPONSE_CODE) {
      return payload
    }
    // if the response is not shaped the way we expect, leave it alone
    // tslint:disable-next-line: no-any
    const liveList: any[] = _.get(payload, ENTITY_LIST_PATH)
    if (!Array.isArray(liveList)) {
      logInfo('PILOT_MOCK_ENTITY: entity list not found in response, skipping')
      return payload
    }
    // scoped to the searched entity type, so every other getAllEntity caller
    // keeps seeing the raw upstream list
    const requestedType = `${_.get(requestBody, 'search.type', '')}`.trim().toLowerCase()
    if (!requestedType) {
      return payload
    }
    // fresh read on every call
    const response = await axios({
      method: 'GET',
      timeout: FETCH_TIMEOUT,
      url: CONSTANTS.PILOT_MOCK_ENTITY_URL,
    })
    const mock = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    const mockRows = Array.isArray(mock) ? mock : [mock]
    // skip anything of another type, or already present upstream
    const liveIds = new Set(liveList.map((row) => `${_.get(row, 'id', '')}`))
    const rowsToAdd = mockRows.filter(
      (row) =>
        _.isPlainObject(row) &&
        `${_.get(row, 'type', '')}`.toLowerCase() === requestedType &&
        !liveIds.has(`${_.get(row, 'id', '')}`)
    )
    if (!rowsToAdd.length) {
      return payload
    }
    logInfo(`PILOT_MOCK_ENTITY: adding ${rowsToAdd.length} mock row(s) to ${liveList.length} live row(s)`)
    // new object, the upstream response is never mutated
    return {
      ...payload,
      result: { ...payload.result, response: [...liveList, ...rowsToAdd] },
    }
  } catch (error) {
    // deliberately swallowed - the demo add-on must never break the live api
    logError('PILOT_MOCK_ENTITY: failed to append mock entity >>>>>>' + error)
    return payload
  }
}
