import { Router } from 'express'
import { bannerApi } from './banner'
import { bulkUploadUserApi } from './bulkUploadUser'
import { bulkUserSsoMappingApi } from './bulkUserSsoMapping'
import { userRegistrationApi } from './userRegistration'
import { userRolesApi } from './userRoles'

export const admin = Router()

admin.use('/userRegistration', userRegistrationApi)
admin.use('/bulk-upload', bulkUploadUserApi)
admin.use('/banners', bannerApi)
admin.use('/userRoles', userRolesApi)
admin.use('/bulk-user-mapping', bulkUserSsoMappingApi)
