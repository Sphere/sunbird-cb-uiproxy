import { Router } from 'express'

import { logError, logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'

import axios from 'axios'
import { axiosRequestConfig } from '../configs/request.config'
import { extractAuthorizationFromRequest } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

export const roleActivityApi = Router()

roleActivityApi.get('/', async (req, res) => {
    try {
        const rootOrg = req.header('rootOrg')
        if (!rootOrg) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        res.status(200).send(getAllRoles())
    } catch (err) {
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

roleActivityApi.get('/:roleKey', async (req, res) => {
    try {
        const rootOrg = req.header('rootOrg')
        const authToken = extractAuthorizationFromRequest(req)
        if (!rootOrg || !authToken) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        // tslint:disable-next-line: no-useless-cast
        const roleKey = req.params.roleKey as string
        const searchBody = {
            childCount : true,
            childNodes: true,
            searches: [
              {
                field : 'name',
                keyword : roleKey,
                type : 'ROLE',
                },
                  {
                    field : 'status',
                    keyword : 'VERIFIED',
                    type : 'ROLE',
                      },
                ],
          }
        logInfo('Req body========>', JSON.stringify(searchBody))
        const response = await axios.post(API_END_POINTS.fracSearchNodes, searchBody, {
            ...axiosRequestConfig,
            headers: {
                Authorization: extractAuthorizationFromRequest(req),
            },
        })
        const returnRoleList: IRole[] = []
        const roleData = response.data.responseData
        if ((typeof roleData !== 'undefined' && roleData.length > 0)) {
            logInfo('Response data exists')
            roleData.forEach((element: IFracRole) => {
                        returnRoleList.push(getRoles(element))
                })
            }
        res.status(200).send(returnRoleList)
    } catch (err) {
        logError('ERROR --> ', err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

export interface IRole {
    type: string,
    id: string,
    name: string,
    description: string,
    status: string,
    source: string,
    childNodes: IActivity[]
}

export interface IActivity {
    type: string,
    id: string,
    name: string,
    description: string,
    status: string,
    source: string,
    parentRole: string
}

export interface IFracRole {
    type: string,
    id: string,
    name: string,
    description: string,
    status: string,
    source: string,
    children: IFracActivity[]
}

export interface IFracActivity {
    type: string,
    id: string,
    name: string,
    description: string,
    status: string,
    source: string
}

function getRoles(role: IFracRole): IRole {
 if (!role.children) {
    return {
        childNodes: [],
        description: role.description,
        id: role.id,
        name: role.name,
        source: role.source,
        status: role.status,
        type: role.type,
    }

 } else {
    const finalChildList: IActivity[] = []
    role.children.forEach((child) => {
         if (child.type === 'ACTIVITY') {
            const activity: IActivity = {
                description: child.description,
                id: child.id,
                name: child.name,
                parentRole: '',
                source: child.source,
                status: child.status,
                type: child.type,

            }
            finalChildList.push(activity)
         }
     })
    return{
        childNodes: finalChildList,
        description: role.description,
        id: role.id,
        name: role.name,
        source: role.source,
        status: role.status,
        type: role.type,
    }

 }
}
function getAllRoles(): IRole[] {
    // tslint:disable
    const roleList: IRole[] =
        [
            {
                childNodes: [
                    {
                        description: 'Implementation of e-Office',
                        id: 'AID002',
                        name: 'Implementation of e-Office',
                        parentRole: 'RID001',
                        source: 'ISTM',
                        status: 'UNVERIFIED',
                        type:  'ACTIVITY',
                    },
                    {
                        description: 'Work related to committee of financial sector statistics',
                        id: 'AID002',
                        name: 'Work related to committee of financial sector statistics',
                        parentRole: 'RID001',
                        source: 'ISTM',
                        status: 'UNVERIFIED',
                        type:  'ACTIVITY',
                    },
                ],
                description: 'Development and deployment of e-Office and training the employees',
                id: 'RID001',
                name: 'Information Technology',
                source: 'ISTM',
                status: 'UNVERIFIED',
                type:  'ROLE',
        },
        {
            childNodes : [
                {
                    description: 'Regional Rural Bank',
                    id: 'AID003',
                    name: 'Regional Rural Bank',
                    parentRole: 'RID002',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
                {
                    description: 'Cyber Security Related Work',
                    id: 'AID004',
                    name: 'Cyber Security Related Work',
                    parentRole: 'RID002',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
                {
                    description: 'Agriculture Credit',
                    id: 'AID005',
                    name: 'Agriculture Credit',
                    parentRole: 'RID002',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
            ],
            description: 'Vigilance',
            id: 'RID002',
            name: 'Vigilance',
            source: 'ISTM',
            status: 'UNVERIFIED',
            type:  'ROLE',
        },
        {
            childNodes : [
                {
                    description: 'Work relating to financial inclusion',
                    id: 'AID006',
                    name: 'Work relating to financial inclusion',
                    parentRole: 'RID003',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
                {
                    description: 'Mission Office',
                    id: 'AID007',
                    name: 'Mission Office',
                    parentRole: 'RID003',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
                {
                    description: 'e-Governance in all FIs and e-Payments in Banking system',
                    id: 'AID008',
                    name: 'e-Governance in all FIs and e-Payments in Banking system',
                    parentRole: 'RID003',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
            ],
            description: 'Coordination with other sections',
            id: 'RID003',
            name: 'Coordination with other sections',
            source: 'ISTM',
            status: 'UNVERIFIED',
            type:  'ROLE',
        },
        {
            childNodes: [
                {
                    description: 'Matters related to payment regulatory board',
                    id: 'AID009',
                    name: 'Matters related to payment regulatory board',
                    parentRole: 'RID004',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
                {
                    description: 'Expansion of banking network',
                    id: 'AID010',
                    name: 'Expansion of banking network',
                    parentRole: 'RID004',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
                {
                    description: 'Lucky Grahak Incentive Yojana',
                    id: 'AID011',
                    name: 'Lucky Grahak Incentive Yojana',
                    parentRole: 'RID004',
                    source: 'ISTM',
                    status: 'UNVERIFIED',
                    type:  'ACTIVITY',
                },
            ],
            description: 'Development and deployment of e-Office and training the employees ',
            id: 'RID004',
            name: 'Financial Inclusion advisory',
            source: 'ISTM',
            status: 'UNVERIFIED',
            type:  'ROLE',
        },
    ]
    return roleList
}