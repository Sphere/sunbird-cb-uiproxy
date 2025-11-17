import axios from 'axios';
import { axiosRequestConfigLong } from '../configs/request.config';
import { CONSTANTS } from '../utils/env';
import { logError, logInfo } from '../utils/logger';
const contentTypeHeader = { 'Content-Type': 'application/json' };
const API_END_POINTS = {
  CONTENT_SEARCH_PROXY: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,
};
export interface ContentSearchRequest {
  request?: {
    // tslint:disable-next-line: no-any
    filters?: Record<string, any>;
    limit?: number;
    sort_by?: Record<string, string>;
  };
}

export interface ContentSearchResponse {
  result: {
    // tslint:disable-next-line: no-any
    content: any[];
    count?: number;
    // other fields from your response
  };
}

export async function searchContent(
  searchRequest: ContentSearchRequest
): Promise<ContentSearchResponse> {
  logInfo('Inside contentSearch API new end Point ');
  const filters = searchRequest.request?.filters || {};
  const sortMethod = searchRequest.request?.sort_by || {
    lastUpdatedOn: 'desc',
  };

  const requestBodyForSearch = {
    request: {
      filters,
      limit: searchRequest.request?.limit || 20,
      sort_by: sortMethod,
    },
    sort: [{ lastUpdatedOn: 'desc' }],
  };

  const headers = {
    Authorization: CONSTANTS.SB_API_KEY,
    ...contentTypeHeader,
  };

  try {
    const searchResponseES = await axios({
      ...axiosRequestConfigLong,
      data: requestBodyForSearch,
      headers,
      method: 'post',
      url: API_END_POINTS.CONTENT_SEARCH_PROXY,
    });

    return searchResponseES.data;
  } catch (error) {
    logError('Error in searchContent: ' + JSON.stringify(error));
    throw error;
  }
}
