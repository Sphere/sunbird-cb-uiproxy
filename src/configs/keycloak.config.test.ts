jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    KEYCLOAK_REALM: 'default-realm',
  },
}))

import { getKeycloakConfig } from './keycloak.config'

describe('getKeycloakConfig', () => {
  it('uses the given url and realm when both are provided', () => {
    const config = getKeycloakConfig('https://custom.kc.test', 'custom-realm')

    expect(config).toEqual({
      'auth-server-url': 'https://custom.kc.test',
      'public-client': true,
      'ssl-required': 'external',
      realm: 'custom-realm',
      resource: 'portal',
    })
  })

  it('falls back to CONSTANTS.KEYCLOAK_REALM and CONSTANTS.HTTPS_HOST/auth when neither is provided', () => {
    const config = getKeycloakConfig()

    expect(config.realm).toBe('default-realm')
    expect(config['auth-server-url']).toBe('https://kc.test/auth')
  })

  it('falls back to CONSTANTS.KEYCLOAK_REALM when realm is an empty string', () => {
    // A malformed MULTI_TENANT_KEYCLOAK entry (e.g. a trailing comma with no
    // URL) can hand this an empty string rather than undefined; it must
    // still fall back to the default realm, not silently use an empty one.
    const config = getKeycloakConfig(undefined, '')

    expect(config.realm).toBe('default-realm')
  })

  it('uses the given realm when it is provided alongside no url', () => {
    const config = getKeycloakConfig(undefined, 'custom-realm')

    expect(config.realm).toBe('custom-realm')
    expect(config['auth-server-url']).toBe('https://kc.test/auth')
  })
})
