
interface UserDetails {
    role: string
    roleForInService?: 'Government' | 'Private'
    serviceType?: 'Regular' | 'Contractual' | 'Private'
}

export const getDetailsAsPerRole = (userDetails: UserDetails) => {
    const DOMEET = 'Madhya Pradesh - National Health Mission'
    const DOMEET_ORG_ID = '0144238134833561601003'
    switch (userDetails?.role) {
        case 'ANM-MP': {
            const designation = 'ANM-MP'
            return {
                designation,
                orgId: DOMEET_ORG_ID,
                orgName: DOMEET,
            }
        }
        case 'CHO-MP': {
            const designation = 'CHO-MP'
            return {
                designation,
                orgId: DOMEET_ORG_ID,
                orgName: DOMEET,
            }
        }

        default:
            return {
                designation: 'NA',
                orgId: 'NA',
                orgName: 'NA',
            }
    }
}

export const validRootOrgs = [
    'Madhya Pradesh - National Health Mission'
]
