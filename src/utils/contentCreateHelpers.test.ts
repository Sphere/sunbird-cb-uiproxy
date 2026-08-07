/**
 * Direct unit coverage for buildContentCreateRequest, shared by
 * service/goals.ts's formGoalRequestObj and service/playlist.ts's
 * formPlaylistRequestObj. Only reached indirectly through those two
 * files' own tests before this file existed — these tests pin the exact
 * request shape each caller depends on, including the field-presence
 * behavior (description/sharedWith appear only when passed) verified
 * during the CHANGE 21/26 validation pass.
 */

import { buildContentCreateRequest } from './contentCreateHelpers'

describe('buildContentCreateRequest', () => {
  it('builds the goals shape: includes description, omits sharedWith', () => {
    const result = buildContentCreateRequest('creator-1', 'user-1', 'Goal Name', 'Goals', 'a goal description')

    expect(result).toEqual({
      request: {
        content: {
          code: 'org.ekstep0.29884945860157064123',
          contentType: 'Collection',
          createdBy: 'user-1',
          creator: 'creator-1',
          description: 'a goal description',
          license: 'CC BY 4.0',
          mimeType: 'application/vnd.ekstep.content-collection',
          name: 'Goal Name',
          primaryCategory: 'Goals',
        },
      },
    })
    expect('sharedWith' in result.request.content).toBe(false)
  })

  it('builds the playlist shape: includes sharedWith, omits description', () => {
    const result = buildContentCreateRequest(
      'creator-1',
      'user-1',
      'A Playlist',
      'Playlist',
      undefined,
      ['user-2', 'user-3']
    )

    expect(result).toEqual({
      request: {
        content: {
          code: 'org.ekstep0.29884945860157064123',
          contentType: 'Collection',
          createdBy: 'user-1',
          creator: 'creator-1',
          license: 'CC BY 4.0',
          mimeType: 'application/vnd.ekstep.content-collection',
          name: 'A Playlist',
          primaryCategory: 'Playlist',
          sharedWith: ['user-2', 'user-3'],
        },
      },
    })
    expect('description' in result.request.content).toBe(false)
  })

  it('omits both description and sharedWith when neither is passed', () => {
    const result = buildContentCreateRequest('creator-1', 'user-1', 'Bare', 'Goals')

    expect('description' in result.request.content).toBe(false)
    expect('sharedWith' in result.request.content).toBe(false)
  })

  it('preserves an explicit null for description, distinct from omission', () => {
    // tslint:disable-next-line: no-any
    const result = buildContentCreateRequest('creator-1', 'user-1', 'Name', 'Goals', null as any)

    expect(result.request.content.description).toBeNull()
    expect('description' in result.request.content).toBe(true)
  })

  it('preserves an empty sharedWith array, distinct from omission', () => {
    const result = buildContentCreateRequest('creator-1', 'user-1', 'Name', 'Playlist', undefined, [])

    expect(result.request.content.sharedWith).toEqual([])
    expect('sharedWith' in result.request.content).toBe(true)
  })

  it('produces a JSON-serialized body that omits undefined-valued keys, matching the wire format either builder path produces', () => {
    const withDescription = buildContentCreateRequest('c', 'u', 'n', 'Goals', 'd')
    const withoutDescription = buildContentCreateRequest('c', 'u', 'n', 'Goals')

    expect(Object.keys(JSON.parse(JSON.stringify(withDescription)).request.content)).toContain('description')
    expect(Object.keys(JSON.parse(JSON.stringify(withoutDescription)).request.content)).not.toContain('description')
  })
})
