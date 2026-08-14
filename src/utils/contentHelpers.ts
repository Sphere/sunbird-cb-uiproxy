import axios, { AxiosResponse } from 'axios'
import { Request, Response } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { IContent, IContentMinimal, TContentType } from '../models/content.model'
import { CONSTANTS } from './env'
import { secureRandomInt } from './randomPasswordGenerator'
const CONTENT_URL_PREFIX_SLICE_REGEX = /http:\/\/private-[^/]+/

/**
 * Maps every result in a content-search response through processContent,
 * then sends it — falling back to an empty-result shape if the upstream
 * sent nothing. Shared by every v6/v1 content-search route.
 *
 * @param res - the Express response to send the (possibly reshaped) result on
 * @param response - the axios response from the upstream search call
 */
export function sendSearchResponse(res: Response, response: AxiosResponse) {
  const contents: IContent[] = response.data.result
  if (Array.isArray(contents)) {
    response.data.result = contents.map((content) => processContent(content))
  }
  res.json(
    response.data || {
      filters: [],
      filtersUsed: [],
      notVisibleFilters: [],
      result: [],
      totalHits: 0,
    }
  )
}

// sonar-cleanup: extracted from home.ts / content.ts GET /searchAutoComplete (CHANGE 24) — query-building was byte-identical in both, neither reads the authenticated user; does NOT catch its own errors so each caller's differently-shaped catch still fires
/**
 * Runs the searchAutoComplete ES query (prefix-match on the query term, or
 * suggested terms only when the query is empty) and sends the filtered
 * hits — shared by the public and protected /searchAutoComplete routes,
 * which build the identical request. Errors are left to propagate to the
 * caller's own try/catch, since each route's error response shape differs.
 *
 * @param req - the incoming request; reads rootOrg/org headers and the q/l query params
 * @param res - the Express response to send the filtered hits on
 * @param esBaseUrl - the caller's own ES base URL (CONSTANTS.ES_BASE)
 */
export async function sendAutoCompleteSearchResponse(req: Request, res: Response, esBaseUrl: string) {
  const rootOrg = req.header('rootOrg')
  const org = req.header('org')
  const query = req.query.q as string
  const lang = req.query.l
  // tslint:disable-next-line: no-any
  const body: any = {
    _source: ['searchTerm'],
    query: {
      bool: {
        filter: [
          {
            term: {
              rootOrg,
            },
          },
          {
            term: {
              org,
            },
          },
        ],
        should: !query.length
          ? undefined
          : [
            {
              prefix: {
                'searchTermAnalysed.keyword': {
                  boost: 4,
                  value: query,
                },
              },
            },
            {
              prefix: {
                searchTermAnalysed: {
                  boost: 2,
                  value: query,
                },
              },
            },
          ],
      },
    },
    size: 20,
  }
  const isSuggestedTerm = {
    term: {
      isSuggested: true,
    },
  }
  if (!query.length) {
    body.query.bool.filter.push(isSuggestedTerm)
  }
  const response = await axios.request({
    auth: {
      password: CONSTANTS.ES_PASSWORD,
      username: CONSTANTS.ES_USERNAME,
    },
    data: body,
    method: 'POST',
    ...axiosRequestConfig,
    url: `${esBaseUrl}/searchautocomplete_${lang}/autocomplete/_search`,
  })
  let data = []
  if (response.data?.hits?.hits) {
    data = response.data.hits.hits.filter((result: { _source: { searchTerm: string } }) => {
      return result._source.searchTerm.length
    })
  }
  res.json(data)
}

export function processContent(content: IContent): IContent {
  if (!content) {
    return content
  }
  return {
    ...content,
    appIcon: processUrl(content.appIcon),
    artifactUrl: processUrl(content.artifactUrl),
    children: Array.isArray(content.children) ? content.children.map((u) => processContent(u)) : [],

    displayContentType: processDisplayContentType(content.contentType, content.resourceType),
    downloadUrl: processDownloadUrl(content.downloadUrl ?? ''),
    introductoryVideo: processUrl(content.introductoryVideo),
    introductoryVideoIcon: processUrl(content.introductoryVideoIcon),
    isExternal: processIsExternal(content.isExternal),
    playgroundResources: (content.playgroundResources ?? []).map((u) => ({
      ...u,
      artifactUrl: processUrl(u.artifactUrl),
    })),
    subTitles: (content.subTitles ?? []).map((u) => ({
      ...u,
      url: processUrl(u.url),
    })),
  }
}

export function shuffleContent(array: IContent[]) {
  let currentIndex = array.length
  let randomIndex = 0
  let temporaryValue: IContent | null = null
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = secureRandomInt(currentIndex)
    currentIndex -= 1

    // And swap it with the current element.
    temporaryValue = array[currentIndex]
    array[currentIndex] = array[randomIndex]
    array[randomIndex] = temporaryValue
  }

  return array
}

export function getMinimalContent(content: IContent): IContentMinimal {
  return {
    appIcon: processUrl(content.appIcon),
    artifactUrl: content.artifactUrl,
    complexityLevel: content.complexityLevel,
    contentType: content.contentType,
    creatorDetails: content.creatorDetails || content.creatorContacts,
    description: content.description,
    displayContentType: processDisplayContentType(content.contentType, content.resourceType),
    duration: content.duration,
    identifier: content.identifier,
    learningMode: content.learningMode,
    mimeType: content.mimeType,
    name: content.name,
    status: content.status,
  }
}

function processIsExternal(isExternal: string | boolean): boolean {
  if (typeof isExternal === 'boolean') {
    return isExternal
  }
  return typeof isExternal === 'string' ? isExternal.toLowerCase() === 'yes' : false
}

export function processUrl(url: string | null | undefined) {
  return (url ?? '').replace(CONTENT_URL_PREFIX_SLICE_REGEX, '/apis/proxies/v8')
}
export function appendUrl(url: string) {
  return '/apis/proxies/v8' + url
}

export function appendProxiesUrl(url: string) {
  return '/apis/proxies/v8/web-hosted/navigator/images/' + url
}

export function processDisplayContentType(contentType: TContentType, resourceType?: string) {
  return resourceType || contentType
}

export function processDownloadUrl(url: string) {
  return processUrl(url)
}
