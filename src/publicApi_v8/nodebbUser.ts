import axios from 'axios'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'

// User cache with TTL (Time To Live)
interface CacheEntry {
  userId: string
  timestamp: number
  lastAccessed: number
}

const userCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_CACHE_SIZE = 50000 // Max 50k users per pod (~8.5MB memory)

// Clear expired cache entries
const cleanExpiredCache = () => {
  const now = Date.now()
  for (const [key, entry] of userCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      userCache.delete(key)
    }
  }
}

// Get user from cache if valid
const getCachedUser = (identifier: string): string | null => {
  cleanExpiredCache()
  const cached = userCache.get(identifier)
  if (cached) {
    logInfo(`User retrieved from cache for identifier: ${identifier}`)
    // Update last accessed time for LRU
    cached.lastAccessed = Date.now()
    return cached.userId
  }
  return null
}

// Remove least recently used entry
const removeLRUEntry = () => {
  let lruKey: string | null = null
  let lruTime = Date.now()

  for (const [key, entry] of userCache.entries()) {
    if (entry.lastAccessed < lruTime) {
      lruTime = entry.lastAccessed
      lruKey = key
    }
  }

  if (lruKey) {
    userCache.delete(lruKey)
    logInfo(`Cache evicted LRU entry: ${lruKey}, Cache size: ${userCache.size}`)
  }
}
// tslint:disable-next-line: no-any
export const fetchnodebbUserDetails = async (
  identifier: string,
  userName: string,
  fullname: string,
  // tslint:disable-next-line: no-any
  req: any,
  // tslint:disable-next-line: no-any
  session?: any
) => {

  try {
    // Check cache first
    const cachedUserId = getCachedUser(identifier)
    if (cachedUserId) {
      if (session) {
        session.nodebbUid = cachedUserId
      }
      return cachedUserId
    }

    logInfo('Entered into Nodebb User details >>>>>>' + req)
    const formatedData = {
      request: {
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
      timeout: 10000, // 10 second timeout
      url: API_END_POINTS.createOrFetchUser,
    })

    const userId = response.data.result.userId.uid

    // Enforce max cache size with LRU eviction
    if (userCache.size >= MAX_CACHE_SIZE) {
      removeLRUEntry()
    }

    // Store in cache
    userCache.set(identifier, {
      lastAccessed: Date.now(),
      timestamp: Date.now(),
      userId,
    })
    logInfo(`User cached for identifier: ${identifier}, Cache size: ${userCache.size}/${MAX_CACHE_SIZE}`)

    // Update session if provided
    if (session) {
      session.nodebbUid = userId
    }

    return userId
  } catch (e) {
    logInfo('Error in creating Nodebb user : ' + e)
    return false
  }
}
