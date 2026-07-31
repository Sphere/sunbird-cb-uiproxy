/**
 * src/service/playlist.ts is NOT an Express-route file — it exports plain,
 * synchronous transform/mapper functions (no axios, no CONSTANTS, no
 * try/catch, no res.send). Its only import is a set of TypeScript interface
 * types from ../models/playlist.model, which have no runtime code at all.
 * So, per the "plain functions" style used in src/service/goals.test.ts,
 * this file calls the exported functions directly and asserts on return
 * values. No jest.mock() is needed since there are no external dependencies.
 *
 * transformToPlaylistBase and transformToPlaylistBaseV3 are private
 * (unexported) helpers; they are exercised indirectly through the exported
 * transformToPlaylistV2 / transformToPlaylistV3 wrappers below.
 */

import {
  formContentRequestObj,
  formPlaylistRequestObj,
  formPlaylistupdateObj,
  transformToPlaylistV2,
  transformToPlaylistV3,
  transformToSbExtCreateRequest,
  transformToSbExtDeleteRequest,
  transformToSbExtPatchRequest,
  transformToSbExtSyncRequest,
  transformToSbExtUpdateRequest,
  transformToSbExtUpsertRequest,
} from './playlist'

/**
 * @description Verifies transformToPlaylistV2 maps every source field, takes
 * the icon from the first content item when shared_by is present, and falls
 * back to null icon / "user" type with sharedBy fields undefined otherwise.
 */
describe('transformToPlaylistV2', () => {
  it('should map every field, taking the icon from the first content item, when shared_by is present', () => {
    const input = {
      content_meta: [{ appIcon: 'icon-1.png', name: 'c1' }, { appIcon: 'icon-2.png', name: 'c2' }],
      created_on: '2020-01-01',
      isShared: 1,
      last_updated_on: '2020-01-02',
      playlist_id: 'pl-1',
      playlist_title: 'My Playlist',
      resource_ids: ['r1', 'r2'],
      root_org: 'org1',
      shared_by: { name: 'Sharer Name', user_email: 'sharer@x.com', user_id: 'sharer-1' },
      shared_on: '2020-01-03',
      status: 'Live',
      user: { email: 'u@x.com', name: 'User', userId: 'u1' },
      visibility: 'Public',
    } as any

    expect(transformToPlaylistV2(input)).toEqual({
      contents: input.content_meta,
      createdOn: '2020-01-01',
      icon: 'icon-1.png',
      id: 'pl-1',
      name: 'My Playlist',
      resourceIds: ['r1', 'r2'],
      sharedBy: 'sharer-1',
      sharedByDisplayName: 'Sharer Name',
      sharedOn: '2020-01-03',
      status: 'Live',
      type: 'share',
      visibility: 'Public',
    })
  })

  it('should set icon to null and type to "user", with sharedBy/sharedByDisplayName undefined, when shared_by is absent', () => {
    const input = {
      content_meta: [],
      created_on: '2020-01-01',
      isShared: 0,
      last_updated_on: '2020-01-02',
      playlist_id: 'pl-2',
      playlist_title: 'Solo Playlist',
      resource_ids: [],
      root_org: 'org1',
      user: { email: 'u@x.com', name: 'User', userId: 'u1' },
      visibility: 'Private',
    } as any

    const result = transformToPlaylistV2(input)
    expect(result.icon).toBeNull()
    expect(result.type).toBe('user')
    expect(result.sharedBy).toBeUndefined()
    expect(result.sharedByDisplayName).toBeUndefined()
    expect(result.sharedOn).toBeUndefined()
    expect(result.status).toBeUndefined()
  })
})

/**
 * @description Verifies transformToPlaylistV3 maps every source field, sums
 * resource durations, and takes the icon from the first resource when
 * sharedBy is present, falling back to null/zero/"user" defaults otherwise.
 */
describe('transformToPlaylistV3', () => {
  it('should map every field, sum resource durations, and take the icon from the first resource, when sharedBy is present', () => {
    const input = {
      createdOn: '2020-02-01',
      isShared: 1,
      lastUpdatedOn: 123,
      playlistTitle: 'V3 Playlist',
      resource_ids: [
        { appIcon: 'icon-a.png', duration: 10 },
        { appIcon: 'icon-b.png', duration: 20 },
      ],
      resourceIds: ['r1', 'r2'],
      sharedBy: 'sharer-2',
      status: 'Live',
      user: { email: 'u@x.com', name: 'User', userId: 'u1' },
      visibility: 'Public',
    } as any

    expect(transformToPlaylistV3(input, 'pl-3')).toEqual({
      contents: input.resource_ids,
      createdOn: '2020-02-01',
      duration: 30,
      icon: 'icon-a.png',
      id: 'pl-3',
      name: 'V3 Playlist',
      resourceIds: ['r1', 'r2'],
      sharedBy: 'sharer-2',
      status: 'Live',
      type: 'share',
      visibility: 'Public',
    })
  })

  it('should set icon to null, duration to 0, and type to "user" when resource_ids is empty and sharedBy is absent', () => {
    const input = {
      createdOn: '2020-02-01',
      isShared: 0,
      lastUpdatedOn: 123,
      playlistTitle: 'Empty Playlist',
      resource_ids: [],
      resourceIds: [],
      sharedBy: undefined,
      user: { email: 'u@x.com', name: 'User', userId: 'u1' },
      visibility: 'Private',
    } as any

    const result = transformToPlaylistV3(input, 'pl-4')
    expect(result.icon).toBeNull()
    expect(result.duration).toBe(0)
    expect(result.type).toBe('user')
    expect(result.sharedBy).toBeUndefined()
  })
})

/**
 * @description Verifies transformToSbExtCreateRequest maps a playlist create
 * request to the sb-ext request shape.
 */
describe('transformToSbExtCreateRequest', () => {
  it('should map a create request to the sb-ext shape', () => {
    const input = {
      content_ids: ['c1', 'c2'],
      createdBy: 'user-1',
      playlist_title: 'New Playlist',
      visibility: 'Public',
    } as any

    expect(transformToSbExtCreateRequest(input)).toEqual({
      content_ids: ['c1', 'c2'],
      playlist_title: 'New Playlist',
      visibility: 'Public',
    })
  })
})

/**
 * @description Verifies transformToSbExtSyncRequest maps
 * only_sharedby_playlist_content into the sync request's content field.
 */
describe('transformToSbExtSyncRequest', () => {
  it('should map only_sharedby_playlist_content to content', () => {
    const input = {
      common_content: [],
      only_sharedby_playlist_content: [{ identifier: 'c1' }],
      only_user_playlist_content: [],
    } as any

    expect(transformToSbExtSyncRequest(input)).toEqual({
      content: [{ identifier: 'c1' }],
    })
  })
})

/**
 * @description Verifies transformToSbExtUpsertRequest maps contentIds to
 * content_ids for adding content to an existing playlist.
 */
describe('transformToSbExtUpsertRequest', () => {
  it('should map contentIds to content_ids for adding content to a playlist', () => {
    const input = { contentIds: ['c1', 'c2'] }
    expect(transformToSbExtUpsertRequest(input)).toEqual({
      content_ids: ['c1', 'c2'],
    })
  })
})

/**
 * @description Verifies transformToSbExtDeleteRequest maps contentIds to
 * content for removing content from an existing playlist.
 */
describe('transformToSbExtDeleteRequest', () => {
  it('should map contentIds to content for deleting content from a playlist', () => {
    const input = { contentIds: ['c1', 'c2'] }
    expect(transformToSbExtDeleteRequest(input)).toEqual({
      content: ['c1', 'c2'],
    })
  })
})

/**
 * @description Verifies transformToSbExtUpdateRequest maps content_ids to a
 * flat list of identifiers while passing through title/visibility unchanged,
 * including when content_ids is an empty array.
 */
describe('transformToSbExtUpdateRequest', () => {
  it('should map content_ids to a list of identifiers and pass through title/visibility', () => {
    const input = {
      content_ids: [{ identifier: 'c1' }, { identifier: 'c2' }],
      playlist_title: 'Renamed Playlist',
      visibility: 'Private',
    } as any

    expect(transformToSbExtUpdateRequest(input)).toEqual({
      content_ids: ['c1', 'c2'],
      playlist_title: 'Renamed Playlist',
      visibility: 'Private',
    })
  })

  it('should map an empty content_ids array to an empty array', () => {
    const input = {
      content_ids: [],
      playlist_title: 'Empty',
      visibility: 'Public',
    } as any

    expect(transformToSbExtUpdateRequest(input)).toEqual({
      content_ids: [],
      playlist_title: 'Empty',
      visibility: 'Public',
    })
  })
})

/**
 * @description Verifies transformToSbExtPatchRequest builds a hierarchy
 * patch payload keyed by the given playlistId, containing the supplied
 * content ids as children.
 */
describe('transformToSbExtPatchRequest', () => {
  it('should build a hierarchy patch payload keyed by playlistId', () => {
    const result = transformToSbExtPatchRequest({ contentIds: ['c1', 'c2'] }, 'playlist-1')
    expect(result).toEqual({
      request: {
        data: {
          hierarchy: {
            'playlist-1': {
              children: ['c1', 'c2'],
              contentType: 'Collection',
              root: true,
            },
          },
          nodesModified: {},
        },
      },
    })
  })
})

/**
 * @description Verifies formPlaylistRequestObj builds the playlist-creation
 * content request payload with the expected static content metadata,
 * creator/user fields, and shareWith list.
 */
describe('formPlaylistRequestObj', () => {
  it('should build a playlist-creation content request payload', () => {
    const result = formPlaylistRequestObj(
      {
        content_ids: ['c1'],
        createdBy: 'creator-1',
        playlist_title: 'A Playlist',
        shareWith: ['u1', 'u2'],
        visibility: 'Public',
      } as any,
      'user-1',
      'unused-username'
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
          sharedWith: ['u1', 'u2'],
        },
      },
    })
  })
})

/**
 * @description Verifies formPlaylistupdateObj builds the content-rename
 * request payload expected by the sb-ext update API.
 */
describe('formPlaylistupdateObj', () => {
  it('should build a content-rename request payload', () => {
    const result = formPlaylistupdateObj({ playlist_title: 'New Title', versionKey: 'v2' })
    expect(result).toEqual({
      request: {
        content: {
          name: 'New Title',
          versionKey: 'v2',
        },
      },
    })
  })
})

/**
 * @description Verifies formContentRequestObj builds a hierarchy patch
 * payload keyed by the created content identifier returned from the
 * upstream create response.
 */
describe('formContentRequestObj', () => {
  it('should build a hierarchy patch payload keyed by the created content identifier', () => {
    const result = formContentRequestObj(
      { content_ids: ['c1', 'c2'] },
      { result: { identifier: 'content-1' } },
      'unused-user-id'
    )

    expect(result).toEqual({
      request: {
        data: {
          hierarchy: {
            'content-1': {
              children: ['c1', 'c2'],
              contentType: 'Collection',
              root: true,
            },
          },
          nodesModified: {},
        },
      },
    })
  })
})
