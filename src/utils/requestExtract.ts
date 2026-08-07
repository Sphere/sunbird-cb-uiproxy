import { Request } from 'express'
export interface IAuthorizedRequest extends Request {
  kauth?: {
    grant: {
      access_token: {
        token: string;
        content: {
          given_name: string;
          family_name: string;
          sub: string;
          name: string;
          email?: string;
          preferred_username?: string;
          session_state: string;
        };
      };
    };
  }
}
// tslint:disable-next-line: no-any
export const extractUserIdFromRequest = (req: any): string => {
  const wid = req.header('wid')
  if (wid) {
    return wid
  }
  return req.session.userId as string
}

export const extractUserId = (req: IAuthorizedRequest): string => {
  const wid = req.header('wid')
  if (wid) {
    return wid
  }
  /* tslint:disable-next-line */
  const userId = (req.kauth &&
    req.kauth.grant.access_token.content.sub) as string
  return userId.split(':')[2]
}

export const extractUserNameFromRequest = (req: IAuthorizedRequest) =>
  /* tslint:disable-next-line */
  (req.kauth && req.kauth.grant.access_token.content.name) as string

export const extractUserEmailFromRequest = (req: IAuthorizedRequest) =>
  /* tslint:disable-next-line */
  ((req.kauth && req.kauth.grant.access_token.content.email) ||
    (req.kauth &&
  /* tslint:disable-next-line */
      req.kauth.grant.access_token.content.preferred_username)) as string

export const extractUserTokenContent = (req: IAuthorizedRequest) => {
  return req.kauth && req.kauth.grant.access_token.content
}

export const extractUserToken = (req: IAuthorizedRequest) => {
  return req.kauth && req.kauth.grant.access_token.token
}

export const extractAuthorizationFromRequest = (
  req: IAuthorizedRequest
): string => {
  const token = req.kauth && req.kauth.grant.access_token.token
  // Bearer is added as other areas are using split function to get the token
  return 'Bearer ' + token
}
