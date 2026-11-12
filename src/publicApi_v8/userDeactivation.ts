import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from './../utils/env'
import { logInfo } from './../utils/logger'
import { API_END_POINTS } from './apiConstants'
export const deactivateUser = Router()
const userDeactivationKey = CONSTANTS.USER_DEACTIVATION_KEY
const userDetails = async (userId) => {
    logInfo('Inside userdetails function', userId)
    try {
        const userSearchData = {
            request: {
                filters: {
                    id: userId,
                },
            },
        }
        const userData = await axios({
            data: userSearchData,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: API_END_POINTS.deactivationKongUpdateUser,
        })
        const userOrgDetails = userData.data.result.response.content[0].organisations[0].organisationId
        logInfo('userOrgDetails', userOrgDetails)
        return userOrgDetails
    } catch (error) {
        return false
    }

}
const updateNullProfileDetails = async (userId) => {
    logInfo('Inside update profile details function')
    try {
        const userProfileUpdateObject = {
            request: {
                email: '',
                firstName: '',
                lastName: '',
                phone: '',
                profileDetails: {},
                userId,
            },
        }
        const userProfileUpdateResponse = await axios({
            data: userProfileUpdateObject,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_END_POINTS.deactivationKongUpdateUser,
        })
        logInfo('User profile update response', userProfileUpdateResponse.data)
        if (userProfileUpdateResponse.data.responseCode == 'OK' && userProfileUpdateResponse.data.result.response == 'SUCCESS') {
            return true
        } else return false
    } catch (error) {
        logInfo(JSON.stringify(error))
        return false
    }
}
const updateUserRoles = async (userId) => {
    logInfo('Inside update user roles route')
    try {
        const userOrgDetails = userDetails(userId)
        const userRoleAssignData = {
            request: {
                organisationId: userOrgDetails,
                roles: [
                ],
                userId,
            },
        }
        const userRoleAssignStatus = await axios({
            data: userRoleAssignData,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: API_END_POINTS.deactivationAssignRole,
        })
        logInfo('user role assign status', userRoleAssignStatus.data)
        if (userRoleAssignStatus.data.result.response == 'SUCCESS') {
            return true
        } else return false
    } catch (error) {
        return false
    }
}
deactivateUser.get('/', async (req, res) => {
    logInfo('Inside deactivate user route')
    try {
        const userDeactivationKeyFromHeaders = req.headers.key
        if (userDeactivationKeyFromHeaders !== userDeactivationKey) {
            return res.status(400).json({
                message: 'User deactivation key missing or invalid',
            })
        }
        const userId = req.query.userId
        const profileUpdateStatus = await updateNullProfileDetails(userId)
        const roleUpdateStatus = await updateUserRoles(userId)
        if (profileUpdateStatus && roleUpdateStatus) {
            res.status(200).json({
                message: 'User deactivated successfully',
            })
        }
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(400).json({
            message: 'Something went wrong while deactivating user',
        })
    }

})
