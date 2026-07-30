import { getDetailsAsPerRole, validRootOrgs } from './mpUtils'

// NOTE the  : the org name in mpUtils.ts contains a NON-BREAKING SPACE
// between "Madhya" and "Pradesh", not a normal space. It is invisible in
// editors and diffs, and it is written explicitly here so this test documents
// the real value instead of silently disagreeing with it.
//
// This matters beyond the test: mpNHMUser.ts:320 does
//   validRootOrgs.includes(isUserExists.userDetails.rootOrgName)
// so any rootOrgName arriving with an ordinary space will NOT match.
// See docs/PROD-VERIFICATION.md.
const DOMEET = 'Madhya Pradesh - National Health Mission'
const DOMEET_ORG_ID = '0144238134833561601003'

describe('mpUtils.getDetailsAsPerRole', () => {
  it.each(['ANM-MP', 'CHO-MP', 'Trainer-MP'])(
    'maps role %s to the NHM org with a matching designation',
    (role) => {
      expect(getDetailsAsPerRole({ role })).toEqual({
        designation: role,
        orgId: DOMEET_ORG_ID,
        orgName: DOMEET,
      })
    }
  )

  it('falls back to NA for an unknown role', () => {
    expect(getDetailsAsPerRole({ role: 'Something-Else' })).toEqual({
      designation: 'NA',
      orgId: 'NA',
      orgName: 'NA',
    })
  })

  it('falls back to NA when the role is empty', () => {
    expect(getDetailsAsPerRole({ role: '' })).toEqual({
      designation: 'NA',
      orgId: 'NA',
      orgName: 'NA',
    })
  })

  it('tolerates a null/undefined userDetails via optional chaining', () => {
    // The implementation uses userDetails?.role, so this must not throw.
    expect(getDetailsAsPerRole(undefined as never)).toEqual({
      designation: 'NA',
      orgId: 'NA',
      orgName: 'NA',
    })
  })
})

describe('mpUtils.validRootOrgs', () => {
  it('contains the NHM org used by getDetailsAsPerRole', () => {
    expect(validRootOrgs).toContain(DOMEET)
  })
})
