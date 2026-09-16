/**
 * Fixtures for handlers that read identity from the request.
 *
 * 33 route files import ../utils/requestExtract, which pulls the user id from
 * a `wid` header or the session, and the token from Keycloak's `kauth` object.
 * These fixtures build request state matching those real shapes so handlers can
 * be exercised without mocking requestExtract itself — preferring real code over
 * a mock wherever it is cheap to do so.
 *
 *   mountRouter(someApi, { requestProps: kauthFor(), session: sessionFor() })
 */

export const TEST_USER_ID = '11111111-2222-3333-4444-555555555555'
export const TEST_TOKEN = 'test-access-token'
export const TEST_ROOT_ORG = 'test-root-org'

/** Keycloak grant shaped as src/utils/requestExtract.ts expects. */
export function kauthFor(userId: string = TEST_USER_ID, token: string = TEST_TOKEN) {
  return {
    kauth: {
      grant: {
        access_token: {
          content: {
            email: 'test.user@example.com',
            family_name: 'User',
            given_name: 'Test',
            name: 'Test User',
            preferred_username: 'testuser',
            session_state: 'test-session-state',
            // requestExtract.extractUserId takes the THIRD colon-separated
            // segment, so this prefix is required, not decorative.
            sub: `realm:user:${userId}`,
          },
          token,
        },
      },
    },
  }
}

/** Session shape used by extractUserIdFromRequest and the permission helper. */
export function sessionFor(userId: string = TEST_USER_ID) {
  return {
    orgs: [],
    rootOrgId: TEST_ROOT_ORG,
    userId,
    userName: 'testuser',
    userRoles: ['PUBLIC'],
  }
}

/** Headers accepted by the various extract* helpers. */
export function authHeaders(userId: string = TEST_USER_ID) {
  return {
    rootorg: TEST_ROOT_ORG,
    wid: userId,
    'X-Authenticated-User-Token': TEST_TOKEN,
  }
}
