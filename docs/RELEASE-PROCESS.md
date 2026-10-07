# Release process

How a change in this repo becomes a deployed release. Nothing here is new policy — it is the
practice the existing releases already follow, written down so the next person does not have
to reconstruct it from `git log`.

Four artefacts, in this order. Skipping one is the usual way a release goes wrong:

| # | Artefact | Example | Why it exists |
|---|---|---|---|
| 1 | Release note | `RELEASE_NOTES/5.2.15.md` | The record of what changed and what to check |
| 2 | Merge to `production` | PR #207 | The code itself |
| 3 | Release branch | `release-5.2.15` | **What Jenkins builds** |
| 4 | Tag + GitHub Release | `v5.2.15` | What people read, and what a rollback names |

---

## 1. Pick the version

Look at the newest file in `RELEASE_NOTES/` and increment. `5.2.14` → `5.2.15`.

The series has stayed in `5.2.x` regardless of whether a release fixed a defect or added a
feature, so a patch bump is the default. Take a minor bump only with a deliberate reason, and
say what it is in the summary — a number that disagrees with the notes around it costs more
confusion than it saves.

**Check the version is free before writing anything.** All three of these must come back empty:

```bash
ls RELEASE_NOTES/5.2.15.md          # no file
git tag -l v5.2.15                  # no tag
git ls-remote --heads origin release-5.2.15
```

## 2. Write the release note

Copy the newest file in `RELEASE_NOTES/` and edit. Keep the structure — the whole file is
pasted into GitHub verbatim, so its headings are what the release page renders.

The sections that earn their place:

- **Summary** — what changed and why, in prose, for someone who was not in the review.
- **Deploy notes & risk** — what could go wrong, what is shared with other features, what was
  deliberately *not* done. Write the awkward parts down; they are the reason anyone opens an
  old release note.
- **Pre-deploy checklist** — checks that need a real environment. Not "tests pass", which CI
  already knows, but the things only production can answer.
- **Release & rollback** — the branch to redeploy to undo this, named explicitly.

Leave the tag row as `` `v5.2.15` `` with no parenthetical. An earlier file carried
`_(to be created)_`, which is true for about an hour and then wrong forever — the published
v5.2.14 page still says it.

Commit the note on the feature branch so it merges with the code it describes.

## 3. Merge to `production`

Open the PR against `production` and merge it there. Every tag in this repo points at a merge
commit on `production`; a tag anywhere else means someone deployed code that was never
reviewed.

```bash
git fetch origin
git log -1 --format='%h %s' origin/production      # note this commit
```

## 4. Cut the release branch

**Jenkins builds a branch, not a tag.** Miss this and the build fails at Checkout.

```bash
git branch release-5.2.15 origin/production
git push origin release-5.2.15
```

## 5. Tag the same commit

```bash
git tag -a v5.2.15 origin/production -m "v5.2.15 — <one line>"
git push origin v5.2.15
```

Branch and tag must resolve to the same commit as `production`:

```bash
git rev-parse origin/production origin/release-5.2.15 $(git rev-list -n1 v5.2.15)
```

Three identical SHAs, or something is wrong.

## 6. Publish the GitHub Release

A tag is **not** a Release. Pushing a tag puts it under the *Tags* sub-tab; the *Releases*
list only shows entries someone published.

With the `gh` CLI:

```bash
gh release create v5.2.15 -F RELEASE_NOTES/5.2.15.md -t v5.2.15 --latest
```

Without it, https://github.com/Sphere/sunbird-cb-uiproxy/releases/new — choose the **existing**
tag, title `v5.2.15`, body = the whole markdown file, tick *Set as the latest release*.

## 7. Run the Jenkins build

| Parameter | Value |
|---|---|
| `github repo branch` | `release-5.2.15` |
| `github_release_tag` | `v5.2.15` |
| `docker_pre_build` | `web-services.build` — fixed, never changes |
| `docker_file_path` | `/var/lib/jenkins/workspace/Build/igot-build/sun-ui-proxy` — fixed |

Only the first two change per release.

## Rollback

Re-run the pipeline against the previous release branch — `release-5.2.14` for this one. That
is why step 4 is not optional: the rollback target has to already exist as a branch.

---

## Known trip-ups

**The pre-push hook fails for everyone.** `npm run build` errors with
`TS1005: '?' expected` in `node_modules/@types/babel__traverse`. That package uses
`infer N extends number`, which needs TypeScript 4.7+; this repo pins 4.2.4. It is not caused by
any branch — it reproduces on `production`.

`npm ls @types/babel__traverse` reports it, `@types/babel__core`, `babel-plugin-jest-hoist` and
`jest-snapshot` as **extraneous** — nothing in `package.json` asks for them. They are left over
from a local Jest install. `npm prune`, or a clean `npm ci`, should clear it. Until then
`--no-verify` is the pragmatic workaround for pushing a tag or branch, and worth fixing properly
rather than living with.

**A release note pasted before tagging goes stale.** See step 2.

**`target_commitish` on the Release looks wrong.** When the tag already exists, GitHub records
the repo's default branch in that field. It has no effect — the tag fixes the commit. Confirm
with `/repos/:owner/:repo/commits/v5.2.15`, which resolves to the real one.
