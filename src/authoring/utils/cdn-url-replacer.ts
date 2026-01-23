/**
 * Utility to replace S3 URLs with CloudFront CDN URLs in response data
 */

import { CONSTANTS } from '../../utils/env'

/**
 * Recursively replace S3 URLs with CDN URLs in an object
 * @param obj - The object to traverse and modify
 * @returns The modified object with replaced URLs
 */
export function replaceCdnUrls(obj: unknown): unknown {
    if (typeof obj === 'string') {
        // Replace S3 URL with CDN URL
        return obj.replace(CONSTANTS.S3_DOMAIN, CONSTANTS.CDN_DOMAIN)
    }

    if (Array.isArray(obj)) {
        // Recursively process array elements
        return obj.map((item) => replaceCdnUrls(item))
    }

    if (obj !== null && typeof obj === 'object') {
        // Recursively process object properties
        const newObj: Record<string, unknown> = {}
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
