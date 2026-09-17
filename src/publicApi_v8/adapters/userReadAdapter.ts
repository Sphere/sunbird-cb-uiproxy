interface UserReadResponse {
  result?: {
    response?: {
      id?: string
      userId?: string
      roles?: string[]
      organisations?: Array<{
        roles?: string[]
      }>
      // tslint:disable-next-line: no-any
      [key: string]: any
    }
  }
  // tslint:disable-next-line: no-any
  [key: string]: any
}

interface UserSearchResponse {
  result?: {
    response?: {
      content?: Array<{
        id?: string
        userId?: string
        // tslint:disable-next-line: no-any
        [key: string]: any
      }>
      // tslint:disable-next-line: no-any
      [key: string]: any
    }
  }
  // tslint:disable-next-line: no-any
  [key: string]: any
}

export const isUserReadRequest = (req: {
  method?: string
  url?: string
}): boolean => {
  return (
    req.method === 'GET' &&
    /^\/kong\/user\/v2\/read\/[^/?]+(?:\?.*)?$/.test(req.url || '')
  )
}

export const adaptUserReadResponse = (response: UserReadResponse): UserReadResponse => {
  const userResponse = response.result?.response
  if (!userResponse) {
    return response
  }

  if (userResponse.userId === undefined && userResponse.id !== undefined) {
    userResponse.userId = userResponse.id
  }

  if (userResponse.roles === undefined) {
    const organisations = Array.isArray(userResponse.organisations)
      ? userResponse.organisations
      : []
    const orgRoles = organisations.reduce<string[]>((acc, org) => {
      if (Array.isArray(org.roles)) {
        acc.push(...org.roles)
      }
      return acc
    }, [])
    userResponse.roles = Array.from(new Set(orgRoles))
  }

  return response
}

// user/v1/search dropped `userId` from each result in result.response.content[], but -
// unlike USER_READ - it never treated root `roles` as derived from organisation roles
// (old content[].roles was already [] regardless of organisations[].roles), so only the
// userId backfill applies here.
export const isUserSearchRequest = (req: {
  method?: string
  url?: string
}): boolean => {
  return (
    req.method === 'POST' &&
    /^\/kong\/user\/v1\/search\/?(?:\?.*)?$/.test(req.url || '')
  )
}

export const adaptUserSearchResponse = (response: UserSearchResponse): UserSearchResponse => {
  const content = response.result?.response?.content
  if (!Array.isArray(content)) {
    return response
  }

  content.forEach((user) => {
    if (user.userId === undefined && user.id !== undefined) {
      user.userId = user.id
    }
  })

  return response
}
