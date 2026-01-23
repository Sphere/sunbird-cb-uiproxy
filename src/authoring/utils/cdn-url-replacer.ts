/**
 * Recursively replace S3 URLs with CloudFront CDN URLs in response data
 */

import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'

/**
 * Recursively replace S3 URLs with CDN URLs in an object
 * @param obj - The object to traverse and modify
 * @returns The modified object with replaced URLs
 */
export function replaceCdnUrls(obj: unknown): unknown {
    // Only proceed if both S3_DOMAIN and CDN_DOMAIN are configured
    logInfo(`[replaceCdnUrls] S3_DOMAIN: ${CONSTANTS.S3_DOMAIN}`)
    logInfo(`[replaceCdnUrls] CDN_DOMAIN: ${CONSTANTS.CDN_DOMAIN}`)

    if (!CONSTANTS.S3_DOMAIN || !CONSTANTS.CDN_DOMAIN) {
        logInfo('[replaceCdnUrls] Skipping replacement: Missing S3_DOMAIN or CDN_DOMAIN')
        return obj
    }

    if (typeof obj === 'string') {
        // Replace S3 URL with CDN URL
        if (obj.includes(CONSTANTS.S3_DOMAIN)) {
            logInfo(`[replaceCdnUrls] Found S3 URL, replacing: ${obj.substring(0, 100)}...`)
            const replaced = obj.replace(new RegExp(CONSTANTS.S3_DOMAIN, 'g'), CONSTANTS.CDN_DOMAIN)
            logInfo(`[replaceCdnUrls] Replaced to: ${replaced.substring(0, 100)}...`)
            return replaced
        }
        return obj
    }

    if (Array.isArray(obj)) {
        // Recursively process array elements
        logInfo(`[replaceCdnUrls] Processing array with ${obj.length} elements`)
        return obj.map((item) => replaceCdnUrls(item))
    }

    if (obj !== null && typeof obj === 'object') {
        // Recursively process object properties
        const newObj: Record<string, unknown> = {}
        const objKeys = Object.keys(obj)
        logInfo(`[replaceCdnUrls] Processing object with ${objKeys.length} properties`)
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                newObj[key] = replaceCdnUrls((obj as Record<string, unknown>)[key])
            }
        }
        return newObj
    }

    // Return primitive values as-is
    return obj
}
