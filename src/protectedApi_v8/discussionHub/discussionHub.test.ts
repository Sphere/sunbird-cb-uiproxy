/**
 * PHASE 1 — discussionHub/discussionHub.ts. This file has no route-handler
 * logic of its own: it is a pure wiring file that creates a Router and
 * mounts seven sibling sub-routers (postsApi, topicsApi, tagsApi,
 * categoriesApi, notificationsApi, usersApi, writeApi) at fixed sub-paths.
 * No axios calls, no try/catch, no validation branches, no
 * `return async () => {...}` never-invoked-closure shape (that bug lives in
 * the sibling users.ts/writeApi.ts modules themselves, not here) — there is
 * simply nothing here that could double-send, hang, or crash. No
 * live-test-unsafe patterns identified.
 *
 * Because the real sibling modules (in particular users.ts and writeApi.ts)
 * are known to contain the never-invoked-closure bug and pull in axios/env/
 * header dependencies of their own, each sibling router is replaced with a
 * minimal stub Router here. This isolates the test to discussionHub.ts's
 * only real behaviour: does it mount the right router at the right path.
 */

jest.mock('./posts', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'posts' })
  )
  return { postsApi: r }
})

jest.mock('./topics', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'topics' })
  )
  return { topicsApi: r }
})

jest.mock('./tags', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'tags' })
  )
  return { tagsApi: r }
})

jest.mock('./categories', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'categories' })
  )
  return { categoriesApi: r }
})

jest.mock('./notifications', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'notifications' })
  )
  return { notificationsApi: r }
})

jest.mock('./users', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'users' })
  )
  return { usersApi: r }
})

jest.mock('./writeApi', () => {
  const { Router } = require('express')
  const r = Router()
  r.get('/', (_req: import('express').Request, res: import('express').Response) =>
    res.status(200).send({ mounted: 'writeApi' })
  )
  return { writeApi: r }
})

import { mountRouter } from '../../test-support/mountRouter'
import { discussionHubApi } from './discussionHub'

const agent = () => mountRouter(discussionHubApi)

/**
 * @description Verifies that discussionHubApi mounts each sibling
 * sub-router at its documented sub-path by dispatching a request to the
 * mount path's root and checking the stubbed sub-router (not some other
 * sub-router) handled it.
 */
describe('discussionHubApi mounting', () => {
  it('should mount postsApi at /posts', async () => {
    const response = await agent().get('/posts')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'posts' })
  })

  it('should mount topicsApi at /topics', async () => {
    const response = await agent().get('/topics')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'topics' })
  })

  it('should mount tagsApi at /tags', async () => {
    const response = await agent().get('/tags')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'tags' })
  })

  it('should mount categoriesApi at /categories', async () => {
    const response = await agent().get('/categories')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'categories' })
  })

  it('should mount notificationsApi at /notifications', async () => {
    const response = await agent().get('/notifications')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'notifications' })
  })

  it('should mount usersApi at /users', async () => {
    const response = await agent().get('/users')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'users' })
  })

  it('should mount writeApi at /writeApi/v2', async () => {
    const response = await agent().get('/writeApi/v2')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'writeApi' })
  })

  it('should return 404 for a path with no matching sub-router', async () => {
    const response = await agent().get('/does-not-exist')
    expect(response.status).toBe(404)
  })
})
