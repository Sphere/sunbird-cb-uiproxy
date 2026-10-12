import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import {
  DEFAULT_CERT_ENTITY,
  isValidCertificateId,
  IVerifiedCertificate,
  normaliseEntity,
  oldIdSearchBody,
  toVerifiedCertificate,
} from './adapters/rcCertificateVerify'
import { API_END_POINTS } from './apiConstants'

// Public certificate verification for the portal's /certs/:id page (QR scan).
// Order, as agreed with the Sunbird-Ed guidance for migrated registries:
//   1. RC record by the id in the QR (new certificates, migrated ones re-downloaded)
//   2. RC record whose oldId is that id (certificates printed before the migration)
// Not found answers 200 { found: false }; the portal then decides between the old
// access-code check and "invalid". Only what the certificate itself prints is returned.
export const certificateVerify = Router()

const RC_BASE = CONSTANTS.SUNBIRD_RC_REGISTRY_BASE
const STATUS_PATH = 'response.status'

async function readById(entity: string, id: string): Promise<IVerifiedCertificate | null> {
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: { Accept: 'application/json' },
      method: 'GET',
      url: `${RC_BASE}/${entity}/${encodeURIComponent(id)}`,
    })
    return toVerifiedCertificate(response.data, entity)
  } catch (error) {
    // RC answers 404 (or 500 on some builds) for an unknown osid: that is "not found", not a failure.
    const status = _.get(error, STATUS_PATH)
    if (status && status < 500) {
      return null
    }
    logInfo(`certificateVerify: read ${entity}/${id} failed with ${status || _.get(error, 'message')}`)
    return null
  }
}

async function findByOldId(entity: string, oldId: string): Promise<IVerifiedCertificate | null> {
  const response = await axios({
    ...axiosRequestConfig,
    data: oldIdSearchBody(oldId),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    url: `${RC_BASE}/${entity}/search`,
  })
  return toVerifiedCertificate(response.data, entity)
}

// The rendered certificate, as the download API serves it (raw SVG for RC certificates).
async function renderedCertificate(certificateId: string): Promise<string> {
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'GET',
      url: `${API_END_POINTS.DOWNLOAD_CERTIFICATE}${encodeURIComponent(certificateId)}`,
    })
    return _.get(response, 'data.result.printUri') || ''
  } catch (error) {
    logError(`certificateVerify: rendering ${certificateId} failed: ${_.get(error, STATUS_PATH) || error}`)
    return ''
  }
}

certificateVerify.get('/verify/:id', async (req, res) => {
  const id = req.params.id
  if (!isValidCertificateId(id)) {
    res.status(400).send({ found: false, message: 'Invalid certificate id', status: 'failed' })
    return
  }
  const entity = normaliseEntity(req.query.entity)
  try {
    // Only course certificates were migrated with an oldId; event schemas have no such field.
    const certificate = (await readById(entity, id)) ||
      (entity === DEFAULT_CERT_ENTITY ? await findByOldId(entity, id) : null)
    if (!certificate) {
      logInfo(`certificateVerify: ${entity} ${id} not found by id or oldId`)
      res.status(200).send({ found: false })
      return
    }
    const printUri = req.query.image === 'true' && !certificate.revoked
      ? await renderedCertificate(certificate.certificateId)
      : ''
    res.status(200).send({ found: true, certificate, printUri })
  } catch (error) {
    // RC unreachable or the search rejected: report it, so the page can fall back
    // instead of telling a visitor that a genuine certificate is invalid.
    logError(`certificateVerify: lookup for ${entity} ${id} failed: ${_.get(error, STATUS_PATH) || error}`)
    res.status(502).send({ found: false, message: 'Certificate service unavailable', status: 'failed' })
  }
})
