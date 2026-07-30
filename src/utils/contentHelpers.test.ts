import {
  appendProxiesUrl,
  appendUrl,
  getMinimalContent,
  processContent,
  processDisplayContentType,
  processDownloadUrl,
  processUrl,
  shuffleContent,
} from './contentHelpers'

// tslint:disable-next-line: no-any
const content = (overrides: any = {}): any => ({
  appIcon: 'http://private-host/icon.png',
  artifactUrl: 'http://private-host/artifact.zip',
  contentType: 'Resource',
  identifier: 'do_123',
  name: 'Sample',
  ...overrides,
})

describe('processUrl', () => {
  it('rewrites a private content host to the proxy path', () => {
    expect(processUrl('http://private-host/a/b.png')).toBe('/apis/proxies/v8/a/b.png')
  })

  it('leaves other URLs untouched', () => {
    expect(processUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })

  it.each([null, undefined, ''])('returns an empty string for %p', (input) => {
    expect(processUrl(input as never)).toBe('')
  })
})

describe('appendUrl / appendProxiesUrl', () => {
  it('prefixes the proxy base path', () => {
    expect(appendUrl('/x.png')).toBe('/apis/proxies/v8/x.png')
  })

  it('prefixes the web-hosted navigator image path', () => {
    expect(appendProxiesUrl('x.png')).toBe(
      '/apis/proxies/v8/web-hosted/navigator/images/x.png'
    )
  })
})

describe('processDisplayContentType', () => {
  it('prefers resourceType when present', () => {
    expect(processDisplayContentType('Resource' as never, 'Video')).toBe('Video')
  })

  it('falls back to contentType', () => {
    expect(processDisplayContentType('Resource' as never)).toBe('Resource')
  })
})

describe('processDownloadUrl', () => {
  it('applies the same rewrite as processUrl', () => {
    expect(processDownloadUrl('http://private-host/d.zip')).toBe('/apis/proxies/v8/d.zip')
  })
})

describe('processContent', () => {
  it.each([null, undefined])('returns %p unchanged', (input) => {
    expect(processContent(input as never)).toBe(input)
  })

  it('rewrites urls and defaults collection fields', () => {
    const result = processContent(content())
    expect(result.appIcon).toBe('/apis/proxies/v8/icon.png')
    expect(result.artifactUrl).toBe('/apis/proxies/v8/artifact.zip')
    expect(result.children).toEqual([])
    expect(result.playgroundResources).toEqual([])
    expect(result.subTitles).toEqual([])
  })

  it('recurses into children', () => {
    const result = processContent(
      content({ children: [content({ appIcon: 'http://private-host/child.png' })] })
    )
    expect(result.children[0].appIcon).toBe('/apis/proxies/v8/child.png')
  })

  it('rewrites urls inside playgroundResources and subTitles', () => {
    const result = processContent(
      content({
        playgroundResources: [{ artifactUrl: 'http://private-host/p.zip' }],
        subTitles: [{ url: 'http://private-host/s.vtt' }],
      })
    )
    expect(result.playgroundResources[0].artifactUrl).toBe('/apis/proxies/v8/p.zip')
    expect(result.subTitles[0].url).toBe('/apis/proxies/v8/s.vtt')
  })

  // processIsExternal is private, exercised through processContent.
  it.each([
    [true, true],
    [false, false],
    ['yes', true],
    ['YES', true],
    ['no', false],
    [undefined, false],
    [123, false],
  ])('maps isExternal %p to %p', (input, expected) => {
    expect(processContent(content({ isExternal: input })).isExternal).toBe(expected)
  })
})

describe('getMinimalContent', () => {
  it('picks the minimal field set and rewrites appIcon', () => {
    const result = getMinimalContent(
      content({ description: 'd', duration: 10, mimeType: 'video/mp4', status: 'Live' })
    )
    expect(result.appIcon).toBe('/apis/proxies/v8/icon.png')
    expect(result.identifier).toBe('do_123')
    expect(result.name).toBe('Sample')
    expect(result.status).toBe('Live')
    // artifactUrl is deliberately NOT rewritten here, unlike processContent.
    expect(result.artifactUrl).toBe('http://private-host/artifact.zip')
  })

  it('falls back from creatorDetails to creatorContacts', () => {
    expect(getMinimalContent(content({ creatorContacts: ['a'] })).creatorDetails).toEqual(['a'])
    expect(
      getMinimalContent(content({ creatorDetails: ['b'], creatorContacts: ['a'] })).creatorDetails
    ).toEqual(['b'])
  })
})

describe('shuffleContent', () => {
  it('preserves every element', () => {
    const input = [1, 2, 3, 4, 5].map((n) => content({ identifier: `do_${n}` }))
    const ids = input.map((c) => c.identifier).sort()
    expect(shuffleContent(input).map((c: { identifier: string }) => c.identifier).sort()).toEqual(ids)
  })

  it('returns an empty array unchanged', () => {
    expect(shuffleContent([])).toEqual([])
  })

  it('eventually produces a different order (is actually shuffling)', () => {
    const original = Array.from({ length: 20 }, (_, i) => content({ identifier: `do_${i}` }))
    let reordered = false
    for (let attempt = 0; attempt < 20 && !reordered; attempt++) {
      const copy = original.map((c: { identifier: string }) => ({ ...c }))
      const shuffled = shuffleContent(copy as never)
      reordered = shuffled.some(
        (c: { identifier: string }, i: number) => c.identifier !== original[i].identifier
      )
    }
    expect(reordered).toBe(true)
  })
})
