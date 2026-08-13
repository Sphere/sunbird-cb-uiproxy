import { Request, Response } from 'express'
import { ERROR } from './message'

// sonar-cleanup: extracted from content.ts's, recommendation.ts's, user/content.ts's
// and user/follow.ts's identical file-local requireOrgHeaders helpers — same
// header(s)-missing 400 shape, only `req`'s type and the org/rootOrg read order
// differed cosmetically across the 4 copies (CHANGE 43)
/**
 * Reads the `org`/`rootOrg` headers most routes in these files require.
 * Sends the standard 400 and returns `null` if either is missing —
 * callers should return immediately when they get `null` back.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the 400 on, if headers are missing
 */
export function requireOrgHeaders(
  req: Request,
  res: Response
): { org: string; rootOrg: string } | null {
  const org = req.header('org')
  const rootOrg = req.header('rootOrg')
  if (!org || !rootOrg) {
    res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
    return null
  }
  return { org, rootOrg }
}
