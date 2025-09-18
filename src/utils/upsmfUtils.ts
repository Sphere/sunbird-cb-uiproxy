
interface UserDetails {
    role: string
    serviceType?: string
}

/**
 * This function takes a UserDetails object and returns an object containing the designation, orgId, and orgName based on the role and serviceType of the user.
 * @param {UserDetails} userDetails - The UserDetails object containing the role and serviceType of the user.
 * @returns {Object} - An object containing the designation, orgId, and orgName based on the role and serviceType of the user.
 */
export const getDetailsAsPerRole = (userDetails: UserDetails) => {
    const DOMEET = 'Department of Medical Education Education and Training'
    const DOMEET_ORG_ID = '0138708679576535041037'
    switch (userDetails?.role) {
        case 'Student':
            return {
                designation: 'ANM-Student-UP',
                orgId: DOMEET_ORG_ID,
                orgName: DOMEET,
            }

        case 'Faculty':
            return {
                designation: 'ANM-Faculty-UP',
                orgId: DOMEET_ORG_ID,
                orgName: DOMEET,
            }

        case 'ANM-UP':
            // tslint:disable-next-line: all
            switch (userDetails?.serviceType) {
                case 'Regular':
                    return {
                        designation: 'ANM-UP',
                        orgId: '01400948801286144024329',
                        orgName: 'Department of Medical Health & Family Welfare (Uttar Pradesh)',
                    }
                case 'Contractual':
                    return {
                        designation: 'ANM-UP',
                        orgId: '0144024313254133763751',
                        orgName: 'National Health Mission (Uttar Pradesh)',
                    }
                case 'Private':
                    return {
                        designation: 'ANM-UP',
                        orgId: '0144024277797191683752',
                        orgName: 'Private (Uttar Pradesh)',
                    }
                default:
                    return {
                        designation: 'ANM-UP',
                        orgId: 'NA',
                        orgName: 'Unknown Service Type',
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
    'National Health Mission (UP)',
    'Department of Medical Education Education and Training',
    'Directorate of Medical Health (UP)',
    'UP State Ministry of Health and Family Welfare',
    'State Institute of Health and Family Welfare, Department of Health & Family Welfare, UP',
]
