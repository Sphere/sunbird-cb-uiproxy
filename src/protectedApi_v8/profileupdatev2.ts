import axios from 'axios'
import { Request, Response, Router } from 'express'
import { logInfo } from '../utils/logger'
import { CONSTANTS } from './../utils/env'
import { extractUserIdFromRequest, extractUserToken } from './../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

// ---- INTERFACES ----
interface PersonalDetails {
    firstname: string; surname: string; dob: string
    regNurseRegMidwifeNumber?: string | null; knownLanguages?: string[]
    primaryEmail: string; officialEmail?: string; personalEmail?: string
    postalAddress: string; pincode: string; osName?: string; browserName?: string
    userCookie?: string; profileLocation?: string
}
interface AcademicDetails {
    nameOfQualification: string; type: string
    nameOfInstitute: string; yearOfPassing: string
}
interface ProfessionalDetails {
    orgType: string; professionOtherSpecify?: string; orgOtherSpecify?: string
    name?: string; nameOther?: string; industry?: string; industryOther?: string
    designation: string; profession: string; responsibilities?: string; description?: string
    completePostalAddress?: string; additionalAttributes?: object; block?: string; subcentre?: string | null
}
interface Preferences { language: string }
interface TncDetails { accepted: boolean; timestamp: string }
interface UserProfile {
    personalDetails?: PersonalDetails
    professionalDetails?: ProfessionalDetails[]
    academics?: AcademicDetails[]
    preferences?: Preferences
    tnc?: TncDetails
}

const invalidUser = 'Invalid userId'
const internalServerError = 'Internal server error'
export const profileupdatev2 = Router()

async function getUserProfile(userId: string): Promise<UserProfile> {
    const userSearch = await axios({
        data: {
            request: {
                filters: { userId },
                query: '',
            },
        },
        method: 'POST',
        url: `${API_END_POINTS.searchSb}`,

    })
    return userSearch.data
}
async function saveUserProfile(userId: string, profile: UserProfile, req: Request): Promise<void> {
    const payload = {
        request: {
            profileDetails: profile,
            userId,
        },
    }
    await axios.post(`${API_END_POINTS.userProfileUpdate}`,
        payload,
        {
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'Content-Type': 'application/json',
                'x-authenticated-user-token': extractUserToken(req), // Function to fetch user token
            },
        }
    )

}

profileupdatev2.post('/updatePersonalDetails', async (req: Request, res: Response) => {
    try {
        const { userId, personalDetails } = req.body as { userId: string, personalDetails: PersonalDetails }
        if (!userId || !personalDetails) return res.status(400).json({ status: 'error', message: 'Missing userId or personalDetails' })
        const userIDFromRequest = extractUserIdFromRequest(req)
        if (userId !== userIDFromRequest) {
            return res.status(400).json({ status: 'error', message: invalidUser })
        }
        const profile = await getUserProfile(userId)
        profile.personalDetails = personalDetails // update only personalDetails
        await saveUserProfile(userId, profile, req)

        res.json({ status: 'success', message: 'Personal details updated' })
    } catch (error) {
        logInfo('Error updating personal details:', JSON.stringify(error))
        res.status(500).json({ status: 'error', message: internalServerError })
    }

})

// Professional Details Setter
profileupdatev2.post('/updateProfessionalDetails', async (req: Request, res: Response) => {
    try {
        const { userId, professionalDetails } = req.body as { userId: string, professionalDetails: ProfessionalDetails[] }
        if (!userId || !professionalDetails) return res.status(400).json({ status: 'error', message: 'Missing userId or professionalDetails' })
        const userIDFromRequest = extractUserIdFromRequest(req)
        if (userId !== userIDFromRequest) {
            return res.status(400).json({ status: 'error', message: invalidUser })
        }
        const profile = await getUserProfile(userId)
        profile.professionalDetails = professionalDetails
        await saveUserProfile(userId, profile, req)

        res.json({ status: 'success', message: 'Professional details updated' })
    } catch (error) {
        logInfo('Error updating professional details:', JSON.stringify(error))
        res.status(500).json({ status: 'error', message: internalServerError })
    }

})

// Academics Setter
profileupdatev2.post('/updateAcademics', async (req: Request, res: Response) => {
    try {
        const { userId, academics } = req.body as { userId: string, academics: AcademicDetails[] }
        if (!userId || !academics) return res.status(400).json({ status: 'error', message: 'Missing userId or academics' })
        const userIDFromRequest = extractUserIdFromRequest(req)
        if (userId !== userIDFromRequest) {
            return res.status(400).json({ status: 'error', message: invalidUser })
        }
        const profile = await getUserProfile(userId)
        profile.academics = academics // update only academics
        await saveUserProfile(userId, profile, req)

        res.json({ status: 'success', message: 'Academic details updated' })
    } catch (error) {
        logInfo('Error updating academic details:', JSON.stringify(error))
        res.status(500).json({ status: 'error', message: internalServerError })
    }
})

// Language Setter
profileupdatev2.post('/updateLanguage', async (req: Request, res: Response) => {
    try {
        const { userId, preferences } = req.body as { userId: string, preferences: Preferences }
        if (!userId || !preferences || !preferences.language) return res.status(400).json({ status: 'error', message: 'Missing userId or language' })
        const userIDFromRequest = extractUserIdFromRequest(req)
        if (userId !== userIDFromRequest) {
            return res.status(400).json({ status: 'error', message: invalidUser })
        }
        const profile = await getUserProfile(userId)
        profile.preferences = preferences // update only preferences.language
        await saveUserProfile(userId, profile, req)
        res.json({ status: 'success', message: 'Language preference updated' })

    } catch (error) {
        logInfo('Error updating language preference:', JSON.stringify(error))
        res.status(500).json({ status: 'error', message: internalServerError })
    }
})

// T&C Setter
profileupdatev2.post('/updateTnc', async (req: Request, res: Response) => {
    try {
        const { userId, acceptTnc, timestamp } = req.body as { userId: string, acceptTnc: boolean, timestamp: string }
        if (!userId || typeof acceptTnc === 'undefined') return res.status(400).json({ status: 'error', message: 'Missing userId or T&C status' })
        const userIDFromRequest = extractUserIdFromRequest(req)
        if (userId !== userIDFromRequest) {
            return res.status(400).json({ status: 'error', message: invalidUser })
        }
        const profile = await getUserProfile(userId)
        profile.tnc = { accepted: acceptTnc, timestamp: timestamp || new Date().toISOString() }
        await saveUserProfile(userId, profile, req)

        res.json({ status: 'success', message: 'Terms and conditions updated' })
    } catch (error) {
        logInfo('Error updating terms and conditions:', JSON.stringify(error))
        res.status(500).json({ status: 'error', message: internalServerError })
    }
})
