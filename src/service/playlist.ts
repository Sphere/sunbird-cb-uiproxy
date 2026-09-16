import {
  IPlaylist,
  IPlaylistCreateRequest,
  IPlaylistGetRequest,
  IPlaylistSbDeleteRequest,
  IPlaylistSbExtBase,
  IPlaylistSbExtRequest,
  IPlaylistSbExtSyncRequest,
  IPlaylistSyncRequest,
  IPlaylistUpsertRequest,

} from '../models/playlist.model'
import { buildContentCreateRequest } from '../utils/contentCreateHelpers'

function transformToPlaylistBase(playlistSbExt: IPlaylistSbExtBase): IPlaylist {
  return {
    contents: playlistSbExt.content_meta,
    createdOn: playlistSbExt.created_on,
    icon: playlistSbExt.content_meta.length ? playlistSbExt.content_meta[0].appIcon : null,
    id: playlistSbExt.playlist_id,
    name: playlistSbExt.playlist_title,
    resourceIds: playlistSbExt.resource_ids,
    sharedBy: playlistSbExt.shared_by && playlistSbExt.shared_by.user_id,
    sharedByDisplayName: playlistSbExt.shared_by && playlistSbExt.shared_by.name,
    sharedOn: playlistSbExt.shared_on,
    status: playlistSbExt.status,
    type: Boolean(playlistSbExt.shared_by) ? 'share' : 'user',
    visibility: playlistSbExt.visibility,
  }
}
export function transformToPlaylistV2(playlistSbExt: IPlaylistSbExtBase): IPlaylist {
  return transformToPlaylistBase(playlistSbExt)
}

function transformToPlaylistBaseV3(playlistSbExt: IPlaylistGetRequest, playlistId: string): IPlaylist {

  return {
    contents: playlistSbExt.resource_ids,
    createdOn: playlistSbExt.createdOn,
    duration: playlistSbExt.resource_ids.reduce((duration, content) => duration + content.duration, 0),
    icon: playlistSbExt.resource_ids.length ? playlistSbExt.resource_ids[0].appIcon : null,
    id: playlistId,
    name: playlistSbExt.playlistTitle,
    resourceIds: playlistSbExt.resourceIds,
    sharedBy: playlistSbExt.sharedBy,
    status: playlistSbExt.status,
    type: Boolean(playlistSbExt.sharedBy) ? 'share' : 'user',
    visibility: playlistSbExt.visibility,
  }
}

export function transformToPlaylistV3(playlistSbExt: IPlaylistGetRequest, playlistId: string): IPlaylist {
  return transformToPlaylistBaseV3(playlistSbExt, playlistId)
}

export function transformToSbExtSyncRequest(syncRequest: IPlaylistSyncRequest): IPlaylistSbExtSyncRequest {
  return {
    content: syncRequest.only_sharedby_playlist_content,
  }
}

export function transformToSbExtUpsertRequest(upsertRequest: IPlaylistUpsertRequest): IPlaylistSbExtRequest {
  /*add content to a playlist*/
  return {
    content_ids: upsertRequest.contentIds,
  }
}

export function transformToSbExtDeleteRequest(upsertRequest: IPlaylistUpsertRequest): IPlaylistSbDeleteRequest {
  /* delete contents from playlist*/
  return {
    content: upsertRequest.contentIds,
  }
}

export function transformToSbExtPatchRequest(req: { contentIds: string[] }, playlistId: string) {
  /* for Patch request to change playlist title */
  const id = playlistId
  const hierarchy = {}

  hierarchy[id] = {
    children: req.contentIds,
    contentType: 'Collection',
    root: true,
  }

  return {
    request: {
      data: {
        hierarchy,
        nodesModified: {},
      },
    },
  }
}

export function formPlaylistRequestObj(request: IPlaylistCreateRequest, userId: string, _userName: string) {
  return buildContentCreateRequest(
    request.createdBy,
    userId,
    request.playlist_title,
    'Playlist',
    undefined,
    request.shareWith
  )
}

export function formPlaylistupdateObj(req: { playlist_title: string, versionKey: string }) {
  return {
    request: {
      content: {
        name: req.playlist_title,
        versionKey: req.versionKey,

      },
    },
  }
}

export function formContentRequestObj(req: { content_ids: string[] }, res: { result: { identifier: string } }, _userId: string) {
  /* for Patch request to change playlist title */
  const id = res.result.identifier
  const hierarchy = {}

  hierarchy[id] = {
    children: req.content_ids,
    contentType: 'Collection',
    root: true,
  }

  return {
    request: {
      data: {
        hierarchy,
        nodesModified: {},
      },
    },
  }

}
