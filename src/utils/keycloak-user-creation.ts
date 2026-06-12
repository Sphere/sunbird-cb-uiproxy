import KcAdminClient from 'keycloak-admin'
import { RequiredActionAlias } from 'keycloak-admin/lib/defs/requiredActionProviderRepresentation'
import request from 'request'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

const defaultNewUserPassword = CONSTANTS.KC_NEW_USER_DEFAULT_PWD

const keycloakConfig = {
    baseUrl: `${CONSTANTS.HTTPS_HOST}/auth`,
    realmName: CONSTANTS.KEYCLOAK_REALM,
    requestConfig: {
        retry: 3,
        retryDelay: 1,
        timeout: Number(CONSTANTS.TIMEOUT) || 10000,
    },
}

const kcAdminClient = new KcAdminClient(keycloakConfig)

// tslint:disable-next-line: no-any
export async function createKeycloakUser(req: any) {
    try {
        await kcAdminClient.auth({
            clientId: 'admin-cli',
            grantType: 'password',
            password: CONSTANTS.KEYCLOAK_ADMIN_PASSWORD,
            username: CONSTANTS.KEYCLOAK_ADMIN_USERNAME,
        })
        kcAdminClient.setConfig({
            realmName: CONSTANTS.KEYCLOAK_REALM,
        })

        const createReq = {
            email: req.body.email,
            emailVerified: true,
            enabled: true,
            firstName: req.body.fname || '',
            lastName: req.body.lname || '',
            username: req.body.email,
        }

        return kcAdminClient.users.create(createReq)
            // tslint:disable-next-line: no-any
            .then((resp: any) => {
                return resp
            })
            // tslint:disable-next-line: no-any
            .catch((err: any) => {
                throw err
            })

    } catch (err) {
        logError('ERROR IN METHOD createKeycloakUser >', err)
        throw err
    }

}

// tslint:disable-next-line: no-any
export async function getAuthToken(email: any): Promise<any> {
    logInfo('Starting to get new user token from keycloak...')
    // tslint:disable-next-line: no-try-promise
    try {
        const request1 = {
            client_id: 'portal',
            grant_type: 'password',
            scope: 'openid',
            username: email,
            // tslint:disable-next-line: object-literal-sort-keys
            password: defaultNewUserPassword,
        }

        return new Promise((resolve, reject) => {
            request.post({
                url: `${CONSTANTS.HTTPS_HOST}/auth/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/token`,
                // tslint:disable-next-line: object-literal-sort-keys
                form: request1,
            }, (err, _httpResponse, body) => {
                if (err) {
                    logError('err in getAuthToken api ', err)
                    reject(err)
                }
                if (body) {
                    resolve(JSON.parse(body))
                }
            })
        })

    } catch (err) {
        logError('ERROR ON Keycloak openid-connect/token >', err)
        return err
    }
}

export async function UpdateKeycloakUserPassword(keycloakId: string, isTemporary: boolean) {
    // tslint:disable-next-line: no-commented-code
    // const request1 = {
    //     type: 'password',
    //     value: 'user@123',
    //     temporary: false,
    // }
    // return await axios.put(
    //     `${CONSTANTS.HTTPS_HOST}/auth/admin/realms/${CONSTANTS.KEYCLOAK_REALM}/users/${keycloakId}/reset-password`,
    //     request1,
    //     {
    //         ...axiosRequestConfig,
    //         headers: {
    //             Authorization: req.header('authorization'),
    //         },
    //     }
    // )
    const req = {
        credential: {
            temporary: isTemporary,
            type: 'password',
            value: defaultNewUserPassword,
        },
        id: keycloakId,
    }
    return kcAdminClient.users.resetPassword(req)
        // tslint:disable-next-line: no-any
        .then((resp: any) => {
            return resp
            // tslint:disable-next-line: no-any
        }).catch((err: any) => {
            throw err
        })
}

export async function sendActionsEmail(userId: string) {
    // try {
    await kcAdminClient.auth({
        clientId: 'portal',
        grantType: 'password',
        password: CONSTANTS.KEYCLOAK_ADMIN_PASSWORD,
        username: CONSTANTS.KEYCLOAK_ADMIN_USERNAME,
    })
    kcAdminClient.setConfig({
        realmName: CONSTANTS.KEYCLOAK_REALM,
    })
    logInfo(`Sending email to ${userId}`)
    logInfo(`redirect Uri: `, CONSTANTS.HTTPS_HOST)
    return kcAdminClient.users.executeActionsEmail({
        actions: [RequiredActionAlias.VERIFY_EMAIL],
        clientId: 'portal',
        id: userId,
        lifespan: 2592000,
        redirectUri: CONSTANTS.HTTPS_HOST,
    })
        // tslint:disable-next-line: no-any
        .then((resp: any) => {
            return resp
            // tslint:disable-next-line: no-any
        }).catch((err: any) => {
            throw err
        })
}
