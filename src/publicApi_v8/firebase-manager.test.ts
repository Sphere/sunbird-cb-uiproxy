/**
 * firebase-manager.ts is a plain, memoized singleton factory (no Router, no
 * res.send). `firebase-admin` is mocked wholesale — its real
 * `initializeApp`/`credential.cert` would attempt real credential
 * validation, which has no place in a unit test.
 */

const mockCert = jest.fn((config) => ({ config, type: 'cert' }))
const mockInitializeApp = jest.fn((options) => ({ initializedWith: options }))
jest.mock('firebase-admin', () => ({
  credential: { cert: (config: unknown) => mockCert(config) },
  initializeApp: (options: unknown) => mockInitializeApp(options),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    FIREBASE_CLIENT_EMAIL: 'svc@test.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n',
    FIREBASE_PROJECT_ID: 'test-project',
  },
}))

/**
 * @description Verifies getFirebaseApp() initializes a Firebase app exactly
 * once (memoizing the instance across calls), builds its credential from
 * CONSTANTS, and unescapes literal \n sequences in the private key.
 */
describe('getFirebaseApp', () => {
  beforeEach(() => {
    jest.resetModules()
    mockCert.mockClear()
    mockInitializeApp.mockClear()
  })

  it('should initialize the Firebase app using the credential built from CONSTANTS', () => {
    const { getFirebaseApp } = require('./firebase-manager')

    getFirebaseApp()

    expect(mockCert).toHaveBeenCalledWith({
      clientEmail: 'svc@test.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n',
      projectId: 'test-project',
    })
    expect(mockInitializeApp).toHaveBeenCalledTimes(1)
  })

  it('should return the same memoized app instance on a second call, without re-initializing', () => {
    const { getFirebaseApp } = require('./firebase-manager')

    const first = getFirebaseApp()
    const second = getFirebaseApp()

    expect(second).toBe(first)
    expect(mockInitializeApp).toHaveBeenCalledTimes(1)
  })
})
