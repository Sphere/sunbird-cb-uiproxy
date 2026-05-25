import * as admin from 'firebase-admin';
import { CONSTANTS } from '../utils/env'

let firebaseApp: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {

  if (firebaseApp) {
    return firebaseApp;
  }
  const FIREBASE_CONFIG: any = {
       type: CONSTANTS.FIREBASE_TYPE,
        project_id: CONSTANTS.FIREBASE_PROJECT_ID,
        private_key_id: CONSTANTS.FIREBASE_PRIVATE_KEY_ID,
        private_key: CONSTANTS.FIREBASE_PRIVATE_KEY,
        client_email: CONSTANTS.FIREBASE_CLIENT_EMAIL,
        client_id: CONSTANTS.FIREBASE_CLIENT_ID,
        auth_uri: CONSTANTS.FIREBASE_AUTH_URI,
        token_uri: CONSTANTS.FIREBASE_TOKEN_URI,
        auth_provider_x509_cert_url: CONSTANTS.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: CONSTANTS.FIREBASE_CLIENT_X509_CERT_URL,
        universe_domain: CONSTANTS.FIREBASE_UNIVERSE_DOMAIN,
  }
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(FIREBASE_CONFIG),
  });

  return firebaseApp;
}