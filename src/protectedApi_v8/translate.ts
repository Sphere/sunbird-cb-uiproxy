import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { API_END_POINTS } from './apiConstants'
export const translateApi = Router()

translateApi.get('/filterdata/:lang', async (req: Request, res: Response) => {
    try {
        const lang = req.params.lang
        const org = req.header('org')
        const rootOrg = req.header('rootOrg')
        if (!lang) {
            res.status(400).send()
        }
        const response = await axios({
            ...axiosRequestConfig,
            headers: {
                org,
                rootOrg,
            },
            method: 'GET',
            url: `${API_END_POINTS.filterTranslate}/${lang}`,
        })
        res.json(response.data)
    } catch (err) {
        res
            .status((err && err.response && err.response.status) || 500)
            .send((err && err.response && err.response.data) || err)
    }

}
)
