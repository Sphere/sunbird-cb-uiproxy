import { getDetailsAsPerRole, validRootOrgs } from './upsmfUtils'

const DOMEET = 'Department of Medical Education Education and Training'
const DOMEET_ORG_ID = '0138708679576535041037'

const NA = { designation: 'NA', orgId: 'NA', orgName: 'NA' }

describe('upsmfUtils.getDetailsAsPerRole', () => {
  describe('simple role mappings', () => {
    it('maps Student', () => {
      expect(getDetailsAsPerRole({ role: 'Student' })).toEqual({
        designation: 'ANM-Student-UP',
        orgId: DOMEET_ORG_ID,
        orgName: DOMEET,
      })
    })

    it('maps Faculty', () => {
      expect(getDetailsAsPerRole({ role: 'Faculty' })).toEqual({
        designation: 'ANM-Faculty-UP',
        orgId: DOMEET_ORG_ID,
        orgName: DOMEET,
      })
    })

    it('maps Medical Officer-UP', () => {
      expect(getDetailsAsPerRole({ role: 'Medical Officer-UP' })).toEqual({
        designation: 'Medical Officer-UP',
        orgId: '0142443633580769283117',
        orgName:
          'State Institute of Health and Family Welfare, Department of Health & Family Welfare, UP',
      })
    })
  })

  // ANM-UP is the branchiest path: role x roleForInService x serviceType.
  describe('ANM-UP', () => {
    it('Government + Regular maps to the DMH&FW org', () => {
      expect(
        getDetailsAsPerRole({
          role: 'ANM-UP',
          roleForInService: 'Government',
          serviceType: 'Regular',
        })
      ).toEqual({
        designation: 'ANM_UP',
        orgId: '01400948801286144024329',
        orgName: 'Department of Medical Health & Family Welfare (Uttar Pradesh)',
      })
    })

    it('Government + Contractual maps to NHM (UP)', () => {
      expect(
        getDetailsAsPerRole({
          role: 'ANM-UP',
          roleForInService: 'Government',
          serviceType: 'Contractual',
        })
      ).toEqual({
        designation: 'ANM_UP',
        orgId: '014017257506177024441',
        orgName: 'National Health Mission (UP)',
      })
    })

    it('roleForInService Private maps to the Private org', () => {
      expect(
        getDetailsAsPerRole({ role: 'ANM-UP', roleForInService: 'Private' })
      ).toEqual({
        designation: 'ANM_UP',
        orgId: '0144024277797191683752',
        orgName: 'Private (Uttar Pradesh)',
      })
    })

    it('serviceType Private also maps to the Private org', () => {
      expect(
        getDetailsAsPerRole({ role: 'ANM-UP', serviceType: 'Private' })
      ).toEqual({
        designation: 'ANM_UP',
        orgId: '0144024277797191683752',
        orgName: 'Private (Uttar Pradesh)',
      })
    })

    it('Government with no serviceType falls through to the NA fallback', () => {
      // Neither Regular nor Contractual matched, and it is not Private.
      expect(
        getDetailsAsPerRole({ role: 'ANM-UP', roleForInService: 'Government' })
      ).toEqual({ designation: 'ANM_UP', orgId: 'NA', orgName: 'NA' })
    })

    it('bare ANM-UP falls through to the NA fallback', () => {
      expect(getDetailsAsPerRole({ role: 'ANM-UP' })).toEqual({
        designation: 'ANM_UP',
        orgId: 'NA',
        orgName: 'NA',
      })
    })
  })

  describe('fallbacks', () => {
    it('returns NA for an unknown role', () => {
      expect(getDetailsAsPerRole({ role: 'Nope' })).toEqual(NA)
    })

    it('tolerates undefined userDetails', () => {
      expect(getDetailsAsPerRole(undefined as never)).toEqual(NA)
    })
  })
})

describe('upsmfUtils.validRootOrgs', () => {
  it('lists every org name returned by getDetailsAsPerRole', () => {
    const returned = [
      getDetailsAsPerRole({ role: 'Student' }).orgName,
      getDetailsAsPerRole({ role: 'Medical Officer-UP' }).orgName,
      getDetailsAsPerRole({
        role: 'ANM-UP',
        roleForInService: 'Government',
        serviceType: 'Regular',
      }).orgName,
      getDetailsAsPerRole({
        role: 'ANM-UP',
        roleForInService: 'Government',
        serviceType: 'Contractual',
      }).orgName,
      getDetailsAsPerRole({ role: 'ANM-UP', roleForInService: 'Private' }).orgName,
    ]
    for (const orgName of returned) {
      expect(validRootOrgs).toContain(orgName)
    }
  })
})
