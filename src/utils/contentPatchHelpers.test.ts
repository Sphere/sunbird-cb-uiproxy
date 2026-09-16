/**
 * Direct unit coverage for patchContentViaHierarchyUpdate, shared by
 * goals.ts's PATCH /:goalId and playlist.ts's PATCH /:playlistId (CHANGE
 * 18). Only reached indirectly through those two files' own route tests
 * before this file existed — these tests pin the two-call PATCH sequence,
 * the rootOrg guard, and the error/status-forwarding behavior directly
 * against the exported function, independent of either caller's route
 * wiring.
 */

jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn() }))
jest.mock('../utils/env', () => ({ CONSTANTS: {} }))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { patchContentViaHierarchyUpdate } from './contentPatchHelpers'

const mockAxios = axios as unknown as jest.Mock

// tslint:disable-next-line: no-any
function mockReq(headers: Record<string, string> = {}, body: any = {}): any {
  return {
    body,
    header: (name: string) => headers[name],
  }
}

// tslint:disable-next-line: no-any
function mockRes(): any {
  const res = {
    send: jest.fn(),
    status: jest.fn(),
  }
  res.status.mockReturnValue(res)
  return res
}

const formUpdateObj = jest.fn((request) => ({ title: request.name }))
const buildHierarchyPatch = jest.fn((request, contentId) => ({ children: request.contentIds, contentId }))

beforeEach(() => {
  mockAxios.mockReset()
  formUpdateObj.mockClear()
  buildHierarchyPatch.mockClear()
})

describe('patchContentViaHierarchyUpdate', () => {
  it('returns 400 with the org-missing error when rootOrg header is absent, without calling axios', async () => {
    const req = mockReq({}, { name: 'New Title' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockAxios).not.toHaveBeenCalled()
    expect(formUpdateObj).not.toHaveBeenCalled()
  })

  it('makes the title-patch call first, then the hierarchy-update call, both PATCH', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({}, 200)).mockResolvedValueOnce(upstreamOk({}, 200))
    const req = mockReq({ Authorization: 'Bearer tok', rootOrg: 'igot' }, { contentIds: ['c1'], name: 'New Title' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    expect(mockAxios).toHaveBeenCalledTimes(2)
    expect(mockAxios.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        data: { title: 'New Title' },
        method: 'PATCH',
        url: expect.stringContaining('/content/v3/update/content-1'),
      })
    )
    expect(mockAxios.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        data: { children: ['c1'], contentId: 'content-1' },
        method: 'PATCH',
        url: expect.stringContaining('/content/v3/hierarchy/update'),
      })
    )
  })

  it('forwards the Authorization header and hardcodes org/rootOrg to dopt/igot on both calls', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({}, 200)).mockResolvedValueOnce(upstreamOk({}, 200))
    const req = mockReq({ Authorization: 'Bearer secret-token', rootOrg: 'someOtherOrg' }, { name: 'x' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    for (const call of mockAxios.mock.calls) {
      expect(call[0].headers).toEqual({
        Authorization: 'Bearer secret-token',
        org: 'dopt',
        rootOrg: 'igot',
      })
    }
  })

  it('sends the first response status on full success', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({}, 200)).mockResolvedValueOnce(upstreamOk({}, 204))
    const req = mockReq({ rootOrg: 'igot' }, { name: 'x' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith()
  })

  it('returns the upstream error status and body when the title-patch call fails', async () => {
    mockAxios.mockRejectedValueOnce(upstreamError(404, { error: 'not found' }))
    const req = mockReq({ rootOrg: 'igot' }, { name: 'x' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledWith({ error: 'not found' })
    expect(mockAxios).toHaveBeenCalledTimes(1)
  })

  it('falls back to 500 with the generic error body on a network-level failure', async () => {
    mockAxios.mockRejectedValueOnce(networkError())
    const req = mockReq({ rootOrg: 'igot' }, { name: 'x' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.send).toHaveBeenCalledWith({ error: 'Failed due to unknown reason' })
  })

  it('propagates the upstream error even if the failure happens on the second (hierarchy) call', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({}, 200)).mockRejectedValueOnce(upstreamError(400, { error: 'bad hierarchy' }))
    const req = mockReq({ rootOrg: 'igot' }, { name: 'x' })
    const res = mockRes()

    await patchContentViaHierarchyUpdate(req, res, 'content-1', formUpdateObj, buildHierarchyPatch)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ error: 'bad hierarchy' })
  })
})
