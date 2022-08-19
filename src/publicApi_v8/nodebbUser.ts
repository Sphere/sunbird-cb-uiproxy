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
  userName: string,
  fullname: string,
  // tslint:disable-next-line: no-any
  req: any
) => {

  try {
    logInfo('Entered into Nodebb User details >>>>>>' + req)
    const formatedData =  {
                            request : {
                              fullname,
                              identifier,
                              username: userName,
                            },
                        }
    logInfo('Entered into Nodebb User details 2 >>>>>>' + JSON.stringify(formatedData))
    const response = await axios({
      ...axiosRequestConfig,
      data: formatedData,
      headers: {
                  Authorization: CONSTANTS.SB_API_KEY,
                  'Content-Type': 'application/json',
                },
                method: 'POST',
                url: API_END_POINTS.createOrFetchUser,
              })

    return response.data.result.userId.uid
  } catch (e) {
    logInfo('Error in creating Nodebb user : ' + e)
    return false
  }
}
