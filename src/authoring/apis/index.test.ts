const mockEditorApi = jest.fn((_req: unknown, res: any) => res.status(200).send({ mounted: 'editorApi' }))
jest.mock('./editor', () => ({
  editorApi: (req: unknown, res: unknown) => mockEditorApi(req, res),
}))

import { mountRouter } from '../../test-support/mountRouter'
import { api } from './index'

const agent = () => mountRouter(api)

/**
 * @description Verifies api mounts editorApi under /editor, so a request to
 * that sub-path is actually dispatched to editorApi rather than falling
 * through unmatched.
 */
describe('api', () => {
  it('should mount editorApi under /editor', async () => {
    const response = await agent().get('/editor/getCompleteDetails/123')

    expect(mockEditorApi).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'editorApi' })
  })

  it('should not dispatch to editorApi for a path outside /editor', async () => {
    const response = await agent().get('/somewhere-else')

    expect(mockEditorApi).not.toHaveBeenCalled()
    expect(response.status).toBe(404)
  })
})
