// cert-registry's download returns printUri in two shapes. Certificates issued
// before Spark carry a data URI ("data:image/svg+xml,<url-encoded svg>" or
// ";base64,..."); certificates sunbird-rc renders on the fly carry the raw
// "<svg ..." markup. Running a raw SVG through decodeURIComponent throws
// "URI malformed" on any "%" (offset="50%"), and cutting at the first ","
// to drop a data URI prefix chops the start off the SVG instead.

const DEFAULT_WIDTH = '1400'
const DEFAULT_HEIGHT = '950'

/** The printable SVG markup, whichever shape printUri arrives in. */
export function toSvgMarkup(printUri: string): string {
  const value = (printUri || '').trim()
  if (!value || value.startsWith('<')) {
    return value
  }
  if (value.startsWith('data:')) {
    const comma = value.indexOf(',')
    const meta = value.substring(0, comma)
    const payload = value.substring(comma + 1)
    if (meta.includes(';base64')) {
      return Buffer.from(payload, 'base64').toString('utf8')
    }
    return safeDecode(payload)
  }
  return safeDecode(value)
}

/** width and height from the root <svg> element, defaulting to 1400x950. */
export function svgSize(svg: string): { width: string, height: string } {
  const root = (svg.match(/<svg\b[^>]*>/i) || [''])[0]
  return {
    height: attribute(root, 'height') || DEFAULT_HEIGHT,
    width: attribute(root, 'width') || DEFAULT_WIDTH,
  }
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([0-9.]+)`, 'i'))
  return match ? match[1] : ''
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
