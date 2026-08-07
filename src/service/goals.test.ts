/**
 * src/service/goals.ts is NOT an Express-route file — it exports plain,
 * synchronous transform/mapper functions (no axios, no CONSTANTS, no
 * try/catch, no res.send). So this test file calls the exported functions
 * directly and asserts on return values, per the "plain functions" style
 * used in src/utils/keycloak-user-creation.test.ts. No jest.mock() needed:
 * the only import inside goals.ts (`processDisplayContentType` from
 * ../utils/contentHelpers) is itself a pure function with no external
 * dependencies, so it's safe to let it run for real.
 *
 * `goalFor` and `isShared` are private (unexported) helpers; they are
 * exercised indirectly through transformToGoalForOthers's `goal_type`
 * branches below.
 */

import {
  formContentRequestObj,
  formGoalRequestObj,
  formPlaylistupdateObj,
  transformGoalUpsertResponse,
  transformToCommonGoal,
  transformToCommonGoalGroup,
  transformToGoalForOthers,
  transformToSbExtPatchRequest,
  transformToTrackStatus,
  transformToUserGoals,
} from './goals'

/**
 * @description Verifies transformToGoalForOthers maps every source field to
 * the common goal shape, falls back correctly between content_data and
 * goal_content_details for contents, and derives goalFor/isShared correctly
 * across all goal_type values.
 */
describe('transformToGoalForOthers', () => {
  const baseInput = {
    content_data: undefined as unknown,
    created_on: 100,
    goal_content_id: ['c1', 'c2'],
    goal_desc: 'desc',
    goal_duration: 30,
    goal_end_date: 200,
    goal_id: 'g1',
    goal_start_date: 150,
    goal_title: 'My Goal',
    goal_type: 'user',
    goalProgess: 50,
    goal_content_details: undefined as unknown,
    last_updated_on: 300,
    recipient_list: ['u1'],
    resource_progress: [],
    shared_by: { userId: 'sharer' },
    shared_on: 400,
    user: { userId: 'u1' },
  }

  it('should map every field and prefer content_data for contents when present', () => {
    const input = {
      ...baseInput,
      content_data: [{ contentType: 'Course', resourceType: 'video' }],
    } as any
    const result = transformToGoalForOthers(input)

    expect(result).toEqual({
      contentIds: ['c1', 'c2'],
      contentProgress: [],
      contents: [
        { contentType: 'Course', resourceType: 'video', displayContentType: 'video' },
      ],
      description: 'desc',
      duration: 30,
      endDate: 200,
      goalFor: 'me',
      id: 'g1',
      isShared: false,
      name: 'My Goal',
      progress: 50,
      sharedBy: { userId: 'sharer' },
      sharedOn: 400,
      sharedWith: ['u1'],
      startDate: 150,
      type: 'user',
      user: { userId: 'u1' },
    })
  })

  it('should fall back to goal_content_details when content_data is absent', () => {
    const input = {
      ...baseInput,
      content_data: undefined,
      goal_content_details: [{ contentType: 'Resource' }],
    } as any
    const result = transformToGoalForOthers(input)
    expect(result.contents).toEqual([
      { contentType: 'Resource', displayContentType: 'Resource' },
    ])
  })

  it('should fall back to an empty array when both content_data and goal_content_details are absent', () => {
    const input = { ...baseInput, content_data: undefined, goal_content_details: undefined } as any
    const result = transformToGoalForOthers(input)
    expect(result.contents).toEqual([])
  })

  it.each([
    ['user', 'me'],
    ['common', 'me'],
    ['common_shared', 'others'],
    ['custom_shared', 'others'],
    ['something_else', 'others'],
  ])('should set goalFor based on goal_type=%s -> %s', (goalType, expected) => {
    const input = { ...baseInput, goal_type: goalType } as any
    expect(transformToGoalForOthers(input).goalFor).toBe(expected)
  })

  it.each([
    ['common_shared', true],
    ['custom_shared', true],
    ['user', false],
    ['common', false],
  ])('should set isShared based on goal_type=%s -> %s', (goalType, expected) => {
    const input = { ...baseInput, goal_type: goalType } as any
    expect(transformToGoalForOthers(input).isShared).toBe(expected)
  })
})

/**
 * @description Verifies transformToCommonGoal maps sb-ext-v2 goal fields
 * onto the common IGoal shape used across the goals service.
 */
describe('transformToCommonGoal', () => {
  it('should map sb-ext-v2 goal fields to the common IGoal shape', () => {
    const input = {
      createdForOthers: true,
      createdForSelf: false,
      createdOn: 111,
      goalContentId: ['a'],
      goalDescription: 'desc2',
      goalTitle: 'title2',
      id: 'gg1',
      resources: [{ identifier: 'r1' }],
    } as any

    expect(transformToCommonGoal(input)).toEqual({
      contentIds: ['a'],
      contents: [{ identifier: 'r1' }],
      createdForOthers: true,
      createdForSelf: false,
      description: 'desc2',
      duration: 0,
      goalFor: 'me',
      id: 'gg1',
      isShared: false,
      name: 'title2',
      type: 'common',
    })
  })
})

/**
 * @description Verifies transformToCommonGoalGroup maps a goal group and its
 * nested goals via transformToCommonGoal, and tolerates a source with no
 * goals array.
 */
describe('transformToCommonGoalGroup', () => {
  it('should map a group and its nested goals via transformToCommonGoal', () => {
    const input = {
      goals: [
        {
          createdForOthers: false,
          createdForSelf: true,
          createdOn: 1,
          goalContentId: [],
          goalDescription: 'd',
          goalTitle: 't',
          id: 'gg1',
          resources: [],
        },
      ],
      group_id: 'grp1',
      group_name: 'Group One',
    } as any

    const result = transformToCommonGoalGroup(input)
    expect(result.id).toBe('grp1')
    expect(result.name).toBe('Group One')
    expect(result.goals).toEqual([
      expect.objectContaining({ id: 'gg1', name: 't', type: 'common' }),
    ])
  })

  it('should leave goals undefined/falsy when the source has no goals array', () => {
    const input = { group_id: 'grp2', group_name: 'Group Two' } as any
    const result = transformToCommonGoalGroup(input)
    expect(result.goals).toBeUndefined()
  })
})

/**
 * @description Verifies transformToUserGoals maps both completed and
 * in-progress goal lists through transformToGoalForOthers into the expected
 * user-goals shape.
 */
describe('transformToUserGoals', () => {
  it('should map completed and in-progress goals through transformToGoalForOthers', () => {
    const goalStub = {
      content_data: [],
      created_on: 1,
      goal_content_id: [],
      goal_desc: '',
      goal_duration: 0,
      goal_id: 'x',
      goal_title: '',
      goal_type: 'user',
      goalProgess: 0,
      last_updated_on: 1,
      recipient_list: [],
      resource_progress: [],
      user: {},
    }
    const input = {
      completed_goals: [{ ...goalStub, goal_id: 'done1' }],
      goals_in_progress: [{ ...goalStub, goal_id: 'ip1' }],
    } as any

    const result = transformToUserGoals(input)
    expect(result.completedGoals).toHaveLength(1)
    expect(result.completedGoals[0].id).toBe('done1')
    expect(result.goalsInProgress).toHaveLength(1)
    expect(result.goalsInProgress[0].id).toBe('ip1')
  })
})

/**
 * @description Verifies transformGoalUpsertResponse maps known error codes
 * through ERROR_CODE_HASH, passes through unknown codes unchanged, and
 * returns an empty object when there are no errors to report.
 */
describe('transformGoalUpsertResponse', () => {
  it('should map a known error code through ERROR_CODE_HASH', () => {
    const response = { errors: [{ code: 'Goal already exists', message: 'dup' }] }
    expect(transformGoalUpsertResponse(response)).toEqual({ error: 'ERROR_GOAL_EXISTS' })
  })

  it('should pass through an unknown error code unchanged', () => {
    const response = { errors: [{ code: 'SOME_OTHER_CODE', message: 'x' }] }
    expect(transformGoalUpsertResponse(response)).toEqual({ error: 'SOME_OTHER_CODE' })
  })

  it('should return an empty object when errors is an empty array', () => {
    expect(transformGoalUpsertResponse({ errors: [] })).toEqual({})
  })

  it('should return an empty object when errors is absent', () => {
    expect(transformGoalUpsertResponse({})).toEqual({})
  })
})

/**
 * @description Verifies transformToTrackStatus maps accepted, pending, and
 * rejected tracking arrays when present, and falls back to empty arrays when
 * they are absent from the source.
 */
describe('transformToTrackStatus', () => {
  it('should map accepted, pending, and rejected arrays when present', () => {
    const input = {
      accepted: [
        {
          goal_end_date: 2,
          goal_progress: 50,
          goal_start_date: 1,
          last_updated_on: 3,
          resource_progress_tracker: [],
          shared_with: { userId: 'u1' },
          status: 1,
        },
      ],
      accepted_count: 1,
      pending: [
        { last_updated_on: 4, shared_with: { userId: 'u2' }, status: 0 },
      ],
      pending_count: 1,
      rejected: [
        { last_updated_on: 5, shared_with: 'u3', status: 2, status_message: 'no thanks' },
      ],
      rejected_count: 1,
    } as any

    expect(transformToTrackStatus(input)).toEqual({
      accepted: [
        {
          endDate: 2,
          lastUpdatedOn: 3,
          progress: 50,
          resourceProgressTracker: [],
          sharedWith: { userId: 'u1' },
          startDate: 1,
          status: 1,
        },
      ],
      pending: [{ lastUpdatedOn: 4, sharedWith: { userId: 'u2' }, status: 0 }],
      rejected: [{ lastUpdatedOn: 5, message: 'no thanks', sharedWith: 'u3', status: 2 }],
    })
  })

  it('should fall back to empty arrays when accepted/pending/rejected are absent', () => {
    const input = {} as any
    expect(transformToTrackStatus(input)).toEqual({
      accepted: [],
      pending: [],
      rejected: [],
    })
  })
})

/**
 * @description Verifies formPlaylistupdateObj builds the content-rename
 * request payload expected by the sb-ext update API.
 */
describe('formPlaylistupdateObj', () => {
  it('should build a content-rename request payload', () => {
    const result = formPlaylistupdateObj({ name: 'New Name', versionKey: 'v1' })
    expect(result).toEqual({
      request: {
        content: {
          name: 'New Name',
          versionKey: 'v1',
        },
      },
    })
  })
})

/**
 * @description Verifies transformToSbExtPatchRequest builds a hierarchy
 * patch payload keyed by the given goalId, containing the supplied content
 * ids as children.
 */
describe('transformToSbExtPatchRequest', () => {
  it('should build a hierarchy patch payload keyed by goalId', () => {
    const result = transformToSbExtPatchRequest({ contentIds: ['c1', 'c2'] }, 'goal-1')
    expect(result).toEqual({
      request: {
        data: {
          hierarchy: {
            'goal-1': {
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
 * @description Verifies formGoalRequestObj builds the goal-creation content
 * request payload with the expected static content metadata and creator/user
 * fields.
 */
describe('formGoalRequestObj', () => {
  it('should build a goal-creation content request payload', () => {
    const result = formGoalRequestObj(
      { createdBy: 'creator-1', description: 'a goal', name: 'Goal Name' },
      'user-1'
    )
    expect(result).toEqual({
      request: {
        content: {
          code: 'org.ekstep0.29884945860157064123',
          contentType: 'Collection',
          createdBy: 'user-1',
          creator: 'creator-1',
          description: 'a goal',
          license: 'CC BY 4.0',
          mimeType: 'application/vnd.ekstep.content-collection',
          name: 'Goal Name',
          primaryCategory: 'Goals',
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
      { contentIds: ['c1', 'c2'] },
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
