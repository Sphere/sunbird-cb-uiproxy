import axios from 'axios'
import { Request, Response, Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserToken } from '../utils/requestExtract'

const API_END_POINTS = {
    applicationTransition: `${CONSTANTS.KONG_API_BASE}/workflow/transition`,
    applicationsSearch: `${CONSTANTS.KONG_API_BASE}/workflow/applications/search`,
    historyBasedOnApplicationId: (applicationId: string) =>
        `${CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE}/v1/workflow/${applicationId}/history`,
    historyBasedOnWfId: (workflowId: string, applicationId: string) =>
        `${CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE}/v1/workflow/${workflowId}/${applicationId}/history`,
    nextActionSearch: (serviceName: string, state: string) =>
        `${CONSTANTS.KONG_API_BASE}/workflow/nextAction/${serviceName}/${state}`,
    userProfileUpdate: `${CONSTANTS.KONG_API_BASE}/workflow/updateUserProfileWF`,
    userWfFieldsSearch: `${CONSTANTS.KONG_API_BASE}/workflow/getUserWFApplicationFields`,
    userWfSearch: `${CONSTANTS.KONG_API_BASE}/workflow/getUserWF`,
    workflowProcess: (wfId: string) => `${CONSTANTS.KONG_API_BASE}/workflow/workflowProcess/${wfId}`,
}

export const workflowHandlerApi = Router()
const unknownError = 'Failed due to unknown reason'
const failedToProcess = 'Failed to process the request. '

/**
 * Reads the `org`/`rootorg` headers the write routes below require. Sends
 * the standard 400 and returns `null` if either is missing — callers
 * should return immediately when they get `null` back.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the 400 on, if headers are missing
 */
function requireWorkflowOrgHeaders(
  req: Request,
  res: Response
): { org: string; rootOrg: string } | null {
    const rootOrgValue = req.headers.rootorg
    const orgValue = req.headers.org
    if (!rootOrgValue || !orgValue) {
        res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
        return null
    }
    return { org: orgValue as string, rootOrg: rootOrgValue as string }
}

/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 */
// tslint:disable-next-line: no-any
function handleWorkflowError(res: Response, err: any) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
        (err && err.response && err.response.data) || {
            error: unknownError,
        }
    )
}

// sonar-cleanup: extracted from this file's 9 routes' repeated
// axios.<method>(url, [body,] {...axiosRequestConfig, headers}) -> forward
// status/data -> handleWorkflowError shape (CHANGE 46). Real per-route
// differences threaded through explicitly: method, whether the request body
// is forwarded, whether/how org headers are attached (both org+rootOrg,
// rootOrg only, or neither), and whether the `wid` header is sent.
/**
 * Proxies a workflow-handler request: makes the upstream axios call, then
 * forwards the upstream status/body, or the caught error, back to the
 * caller.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the upstream result or error on
 * @param method - 'GET' or 'POST'
 * @param url - the resolved upstream endpoint
 * @param sendBody - whether to forward `req.body` as the request body (GET routes here never do)
 * @param orgHeaders - `{org, rootOrg}` to attach, `{rootOrg}` alone, or `undefined` to attach neither
 * @param wid - the `wid` header value to attach, when the route forwards one
 */
async function proxyWorkflowRoute(
    req: Request,
    res: Response,
    method: 'GET' | 'POST',
    url: string,
    sendBody: boolean,
    orgHeaders?: { org?: string; rootOrg: string },
    wid?: string
) {
    try {
        const headers: { [key: string]: string | undefined } = {
            Authorization: CONSTANTS.SB_API_KEY,
            // tslint:disable-next-line: all
            'x-authenticated-user-token': extractUserToken(req),
        }
        if (orgHeaders) {
            headers.rootOrg = orgHeaders.rootOrg
            if (orgHeaders.org) {
                headers.org = orgHeaders.org
            }
        }
        if (wid) {
            headers.wid = wid
        }
        const response = method === 'POST'
            ? await axios.post(url, sendBody ? req.body : undefined, { ...axiosRequestConfig, headers })
            : await axios.get(url, { ...axiosRequestConfig, headers })
        res.status(response.status).send(response.data)
    } catch (err) {
        handleWorkflowError(res, err)
    }
}

workflowHandlerApi.post('/transition', async (req, res) => {
    const orgHeaders = requireWorkflowOrgHeaders(req, res)
    if (!orgHeaders) {
        return
    }
    await proxyWorkflowRoute(req, res, 'POST', API_END_POINTS.applicationTransition, true, orgHeaders)
})

workflowHandlerApi.post('/applicationsSearch', async (req, res) => {
    const orgHeaders = requireWorkflowOrgHeaders(req, res)
    if (!orgHeaders) {
        return
    }
    await proxyWorkflowRoute(req, res, 'POST', API_END_POINTS.applicationsSearch, true, orgHeaders)
})

workflowHandlerApi.get('/nextActionSearch/:serviceName/:state', async (req, res) => {
    const serviceName = req.params.serviceName
    const state = req.params.state
    await proxyWorkflowRoute(
        req, res, 'GET', API_END_POINTS.nextActionSearch(serviceName, state), false,
        { org: req.headers.org as string, rootOrg: req.headers.rootorg as string }
    )
})

workflowHandlerApi.get('/historyByApplicationIdAndWfId/:applicationId/:wfId', async (req, res) => {
    const wfId = req.params.wfId
    const applicationId = req.params.applicationId
    await proxyWorkflowRoute(
        req, res, 'GET', API_END_POINTS.historyBasedOnWfId(wfId, applicationId), false,
        { org: req.headers.org as string, rootOrg: req.headers.rootorg as string }
    )
})

workflowHandlerApi.get('/workflowProcess/:wfId', async (req, res) => {
    const wfId = req.params.wfId
    await proxyWorkflowRoute(
        req, res, 'GET', API_END_POINTS.workflowProcess(wfId), false,
        { rootOrg: req.headers.rootorg as string }
    )
})

workflowHandlerApi.get('/historyByApplicationId/:applicationId', async (req, res) => {
    const applicationId = req.params.applicationId
    await proxyWorkflowRoute(
        req, res, 'GET', API_END_POINTS.historyBasedOnApplicationId(applicationId), false,
        { org: req.headers.org as string, rootOrg: req.headers.rootorg as string }
    )
})

workflowHandlerApi.post('/updateUserProfileWf', async (req, res) => {
    const orgHeaders = requireWorkflowOrgHeaders(req, res)
    if (!orgHeaders) {
        return
    }
    await proxyWorkflowRoute(req, res, 'POST', API_END_POINTS.userProfileUpdate, true, orgHeaders)
})

workflowHandlerApi.post('/userWfSearch', async (req, res) => {
    const orgHeaders = requireWorkflowOrgHeaders(req, res)
    if (!orgHeaders) {
        return
    }
    await proxyWorkflowRoute(
        req, res, 'POST', API_END_POINTS.userWfSearch, true, orgHeaders, req.headers.wid as string
    )
})

workflowHandlerApi.post('/userWFApplicationFieldsSearch', async (req, res) => {
    const orgHeaders = requireWorkflowOrgHeaders(req, res)
    if (!orgHeaders) {
        return
    }
    await proxyWorkflowRoute(
        req, res, 'POST', API_END_POINTS.userWfFieldsSearch, true, orgHeaders, req.headers.wid as string
    )
})
