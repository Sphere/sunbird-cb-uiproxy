import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { API_END_POINTS } from './apiConstants'

export const eventsApi = Router()

eventsApi.get('/', async (_req, res) => {
  try {
    const response = await axios.get(API_END_POINTS.liveEvents, {
      ...axiosRequestConfig,
    })
    res.send((response.data))
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      })
  }
})
