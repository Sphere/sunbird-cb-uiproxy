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
    credential: admin.credential.cert(FIREBASE_CONFIG),
  })

  return firebaseApp
}

export interface ITopicNotification {
  topic: string
  title?: string
  body?: string
  data?: { [key: string]: string }
  imageUrl?: string
}

// Falls back to the logo inside data.actionData so course notifications show the course thumbnail.
function resolveImageUrl(imageUrl?: string, data?: { [key: string]: string }): string | undefined {
  if (imageUrl) {
    return imageUrl
  }
  try {
    const logo = data && data.actionData ? JSON.parse(data.actionData).logo : undefined
    return typeof logo === 'string' && logo.startsWith('https://') ? logo : undefined
  } catch {
    return undefined
  }
}

// Sends a notification to every device subscribed to the topic; returns the FCM message id.
export async function sendTopicNotification({ topic, title, body, data, imageUrl }: ITopicNotification): Promise<string> {
  const image = resolveImageUrl(imageUrl, data)
  const message: admin.messaging.Message = {
    android: {
      notification: {
        sound: 'default',
      },
      priority: 'high',
    },
    apns: {
      // mutable-content lets the iOS Notification Service Extension download and attach the image
      fcmOptions: image ? { imageUrl: image } : undefined,
      payload: {
        aps: {
          mutableContent: !!image,
          sound: 'default',
        },
      },
    },
    data: data || {},
    notification: {
      body: body || '',
      imageUrl: image,
      title: title || 'Notification',
    },
    topic,
  }
  return getFirebaseApp().messaging().send(message)
}
