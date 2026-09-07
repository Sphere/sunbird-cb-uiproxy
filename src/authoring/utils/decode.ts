export function decoder(data: string): {} {
  const sBinaryString = Buffer.from(data, 'base64').toString('binary')
  const aBinaryView = new Uint8Array(sBinaryString.length)
  Array.prototype.forEach.call(
    aBinaryView,
    (_el, idx, arr) => (arr[idx] = sBinaryString.codePointAt(idx))
  )
  data = JSON.parse(
    new Uint16Array(aBinaryView.buffer).reduce((str, byte) => str + String.fromCodePoint(byte), '')
  )
  return data
}
