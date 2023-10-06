import crypto from 'crypto'
import { CONSTANTS } from '../utils/env'

const aesData = {
  encryption_method: CONSTANTS.AES_ENCRYPTION_METHOD,
  encryption_secret: CONSTANTS.AES_ENCRYPTION_SECRET,
  secret_iv: CONSTANTS.AES_SECRET_IV,
  secret_key: CONSTANTS.AES_SECRET_KEY,
}

// Generate secret hash with crypto to use for encryption
const key = crypto
  .createHash('sha512')
  .update(aesData.secret_key)
  .digest('hex')
  .substring(0, 32)
const encryptionIV = crypto
  .createHash('sha512')
  .update(aesData.secret_iv)
  .digest('hex')
  .substring(0, 16)
export function encryptData(data) {
  const cipher = crypto.createCipheriv(
    aesData.encryption_method,
    key,
    encryptionIV
  )
  return Buffer.from(
    cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
  ).toString('base64') // Encrypts data and converts to hex and base64
}
