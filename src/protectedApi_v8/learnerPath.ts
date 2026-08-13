import { CONSTANTS } from '../utils/env'
import { createLearnerPathRouter } from '../utils/learnerPathRouterFactory'

// sonar-cleanup: body moved into utils/learnerPathRouterFactory.ts, shared
// with learnerPathV2.ts (CHANGE 29)
export const learnerPathApi = createLearnerPathRouter(CONSTANTS.RECOMMENDATION_API_BASE_V2, '')
