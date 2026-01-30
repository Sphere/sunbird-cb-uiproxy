/**
 * Recursively replace S3 URLs with CloudFront CDN URLs in response data
 */

import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'

/**
 * Replace S3 URLs in a string with CDN URLs
 * @param str - The string to process
 * @returns The string with replaced URLs
 */
function replaceS3UrlInString(str: string): string {
    // Support multiple S3 bucket domains: sunbirdcontent*, s3*.amazonaws.com
    const s3Pattern = /https:\/\/[^/]*\.s3[^/]*\.amazonaws\.com\//g

    if (s3Pattern.test(str)) {
        logInfo(`[replaceCdnUrls] Found S3 URL, replacing: ${str.substring(0, 100)}...`)
        const replaced = str.replace(/https:\/\/[^/]*\.s3[^/]*\.amazonaws\.com\//g, CONSTANTS.CDN_DOMAIN)
        logInfo(`[replaceCdnUrls] Replaced to: ${replaced.substring(0, 100)}...`)
        return replaced
    }

    // Fallback: Also check for exact S3_DOMAIN match if configured
    if (CONSTANTS.S3_DOMAIN && str.includes(CONSTANTS.S3_DOMAIN)) {
        logInfo(`[replaceCdnUrls] Found S3 URL (fallback), replacing: ${str.substring(0, 100)}...`)
        const escapedS3Domain = CONSTANTS.S3_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const replaced = str.replace(new RegExp(escapedS3Domain, 'g'), CONSTANTS.CDN_DOMAIN)
        logInfo(`[replaceCdnUrls] Replaced to: ${replaced.substring(0, 100)}...`)
        return replaced
    }

    return str
}

/**
 * Recursively replace S3 URLs with CDN URLs in an object
 * @param obj - The object to traverse and modify
 * @returns The modified object with replaced URLs
 */
export function replaceCdnUrls(obj: unknown): unknown {
    logInfo(`[replaceCdnUrls] S3_DOMAIN: ${CONSTANTS.S3_DOMAIN}`)
    logInfo(`[replaceCdnUrls] CDN_DOMAIN: ${CONSTANTS.CDN_DOMAIN}`)

    if (!CONSTANTS.S3_DOMAIN || !CONSTANTS.CDN_DOMAIN) {
        logInfo('[replaceCdnUrls] Skipping replacement: Missing S3_DOMAIN or CDN_DOMAIN')
        return obj
    }

    if (typeof obj === 'string') {
        return replaceS3UrlInString(obj)
    }

    if (Array.isArray(obj)) {
        logInfo(`[replaceCdnUrls] Processing array with ${obj.length} elements`)
        return obj.map((item) => replaceCdnUrls(item))
    }

    if (obj !== null && typeof obj === 'object') {
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

    return obj
}
