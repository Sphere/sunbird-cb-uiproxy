import { mountRouter } from '../../../test-support/mountRouter'
import { editorApi } from './index'

const agent = () => mountRouter(editorApi)

/**
 * @description Verifies editorApi's single passthrough middleware calls
 * next() and does not itself handle any route, so an unmatched request
 * falls through to a 404.
 */
describe('editorApi', () => {
  it('should fall through to a 404 for any request, since no route is registered', async () => {
    const response = await agent().get('/getCompleteDetails/123')
    expect(response.status).toBe(404)
  })
})
