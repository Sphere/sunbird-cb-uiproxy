import * as admin from 'firebase-admin'
import { CONSTANTS } from '../utils/env'

let firebaseApp: admin.app.App | null = null

export function getFirebaseApp(): admin.app.App {

  if (firebaseApp) {
    return firebaseApp
  }

  const FIREBASE_CONFIG: admin.ServiceAccount = {
    clientEmail: CONSTANTS.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    projectId: CONSTANTS.FIREBASE_PROJECT_ID,
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(FIREBASE_CONFIG),
  })

  return firebaseApp
}
