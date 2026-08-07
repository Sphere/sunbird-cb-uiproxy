// sonar-cleanup: extracted from service/goals.ts formGoalRequestObj + service/playlist.ts formPlaylistRequestObj (CHANGE 21) — every differing field passed in explicitly, no shared request type
/**
 * Builds the content-creation request body shared by the goal-create and
 * playlist-create flows — same static content metadata shape, differing
 * only in a handful of fields each caller supplies explicitly. Keeping
 * these as parameters (rather than a shared request type) means goals.ts
 * and playlist.ts stay free to evolve their own field independently.
 *
 * @param createdBy - the content creator, forwarded from the caller's request
 * @param userId - the id to stamp as createdBy on the content
 * @param name - the content's display name (goal name / playlist title)
 * @param primaryCategory - 'Goals' or 'Playlist'
 * @param description - goal description; omitted for playlists
 * @param sharedWith - playlist share list; omitted for goals
 */
export function buildContentCreateRequest(
  createdBy: string,
  userId: string,
  name: string,
  primaryCategory: string,
  description?: string,
  sharedWith?: string[]
) {
  return {
    request: {
      content: {
        code: 'org.ekstep0.29884945860157064123',
        contentType: 'Collection',
        createdBy: userId,
        creator: createdBy,
        ...(description !== undefined ? { description } : {}),
        license: 'CC BY 4.0',
        mimeType: 'application/vnd.ekstep.content-collection',
        name,
        primaryCategory,
        ...(sharedWith !== undefined ? { sharedWith } : {}),
      },
    },
  }
}
