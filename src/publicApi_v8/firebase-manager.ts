import * as admin from 'firebase-admin'
import { CONSTANTS } from '../utils/env'

let firebaseApp: admin.app.App | null = null

export function getFirebaseApp(): admin.app.App {

  if (firebaseApp) {
    return firebaseApp
  }

  const FIREBASE_CONFIG: admin.ServiceAccount = {
    clientEmail: CONSTANTS.FIREBASE_CLIENT_EMAIL,
    privateKey: CONSTANTS.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    projectId: CONSTANTS.FIREBASE_PROJECT_ID,
  }

  firebaseApp = admin.initializeApp({

  })

  return firebaseApp
}

export interface ITopicNotification {
  topic: string
  title?: string
  body?: string
  data?: { [key: string]: string }
}

// Sends a notification to every device subscribed to the topic; returns the FCM message id.
export async function sendTopicNotification({ topic, title, body, data }: ITopicNotification): Promise<string> {
  const message: admin.messaging.Message = {
    android: {
      notification: {
        sound: 'default',
      },
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
    data: data || {},
    notification: {
      body: body || '',
      title: title || 'Notification',
    },
    topic,
  }
  return getFirebaseApp().messaging().send(message)
}
