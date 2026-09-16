import { CONSTANTS } from '../utils/env'
import { createLearnerPathRouter } from '../utils/learnerPathRouterFactory'

// sonar-cleanup: body moved into utils/learnerPathRouterFactory.ts, shared
// with learnerPath.ts (CHANGE 29)
export const learnerPathApiV2 = createLearnerPathRouter(CONSTANTS.SB_EXT_API_BASE_2, ' v2')
