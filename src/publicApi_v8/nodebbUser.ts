import axios from 'axios'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
const API_END_POINTS = {
  createOrFetchUser: `${CONSTANTS.KONG_API_BASE}/discussion/user/v1/create`,
}
// tslint:disable-next-line: no-any
export const fetchnodebbUserDetails = async (
  identifier: string,
  userName : string,
  fullname : string,
  // tslint:disable-next-line: no-any
  req: any
) => {

  try { 
    logInfo("Entered into Nodebb User details >>>>>>"+ req)
    const formatedData =  {
                            request : {
                              username: userName,
                              identifier: identifier,
                              fullname: fullname
                                
                            },
                        }
     logInfo("Entered into Nodebb User details 2 >>>>>>"+ JSON.stringify(formatedData))
    const response = await axios({
      ...axiosRequestConfig,
      data: formatedData,
      headers: {
                  Authorization: CONSTANTS.SB_API_KEY,
                  "Content-Type":"application/json"
                },
                method: 'POST',
                url:API_END_POINTS.createOrFetchUser,
              })

     const fetchUidResponse = response.data.result.userId.uid
    //util.inspect(response, depth=2)
    return fetchUidResponse
  } catch (e) {
    logInfo('Error throwing Cookie : ' + e)
    return false
  }
}
