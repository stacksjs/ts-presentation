export type PictureFormat = 'png' | 'jpeg'
export interface OriginalPicture { format: PictureFormat, data: string }

export const maxOriginalPictureBytes: number = 16 * 1024 * 1024

function isStaticPng(bytes: DataView): boolean {
  if (bytes.byteLength < 45 || bytes.getUint32(0) !== 0x89504E47 || bytes.getUint32(4) !== 0x0D0A1A0A
    || bytes.getUint32(8) !== 13 || bytes.getUint32(12) !== 0x49484452 || !bytes.getUint32(16) || !bytes.getUint32(20)) return false
  let hasPixels = false
  for (let start = 33; start + 12 <= bytes.byteLength;) {
    const length = bytes.getUint32(start)
    const kind = bytes.getUint32(start + 4)
    const end = start + 12 + length
    if (end > bytes.byteLength || kind === 0x6163544C) return false // acTL
    if (kind === 0x65584966 && !uprightExif(new DataView(bytes.buffer, bytes.byteOffset + start + 8, length))) return false // eXIf
    if (kind === 0x49444154 && length) hasPixels = true // IDAT
    if (kind === 0x49454E44) return hasPixels && length === 0 && end === bytes.byteLength // IEND
    start = end
  }
  return false
}

function uprightExif(bytes: DataView): boolean {
  if (bytes.byteLength < 8) return false
  const order = bytes.getUint16(0)
  if (order !== 0x4949 && order !== 0x4D4D) return false
  const little = order === 0x4949
  if (bytes.getUint16(2, little) !== 42) return false
  const directory = bytes.getUint32(4, little)
  if (directory < 8 || directory + 2 > bytes.byteLength) return false
  const count = bytes.getUint16(directory, little)
  const end = directory + 2 + count * 12
  if (end > bytes.byteLength) return false
  for (let entry = directory + 2; entry < end; entry += 12) {
    if (bytes.getUint16(entry, little) !== 0x0112) continue
    return bytes.getUint16(entry + 2, little) === 3 && bytes.getUint32(entry + 4, little) === 1
      && bytes.getUint16(entry + 8, little) === 1
  }
  return true
}

function isUprightJpeg(bytes: DataView): boolean {
  if (bytes.byteLength < 8 || bytes.getUint16(0) !== 0xFFD8 || bytes.getUint16(bytes.byteLength - 2) !== 0xFFD9) return false
  let hasFrame = false
  for (let start = 2; start + 4 <= bytes.byteLength;) {
    if (bytes.getUint8(start++) !== 0xFF) return false
    while (start < bytes.byteLength && bytes.getUint8(start) === 0xFF) start++
    if (start + 3 > bytes.byteLength) return false
    const kind = bytes.getUint8(start++)
    const size = bytes.getUint16(start)
    const end = start + size
    if (size < 2 || end >= bytes.byteLength) return false
    if (kind === 0xDA) return hasFrame
    if (kind === 0xC0 || kind === 0xC1 || kind === 0xC2)
      hasFrame = size >= 8 && bytes.getUint16(start + 3) > 0 && bytes.getUint16(start + 5) > 0
    if (kind === 0xE1 && size >= 8 && bytes.getUint32(start + 2) === 0x45786966 && bytes.getUint16(start + 6) === 0)
      if (!uprightExif(new DataView(bytes.buffer, bytes.byteOffset + start + 8, size - 8))) return false
    start = end
  }
  return false
}

export function originalPicture(bytes: Uint8Array): OriginalPicture | undefined {
  if (bytes.byteLength > maxOriginalPictureBytes) return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const format = isStaticPng(view) ? 'png' : isUprightJpeg(view) ? 'jpeg' : undefined
  if (format) return { format, data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64') }
}

export function dataPicture(url: string): OriginalPicture | undefined {
  const header = /^data:image\/(jpeg|png);base64,/i.exec(url)
  if (!header || url.length - header[0].length > Math.ceil(maxOriginalPictureBytes / 3) * 4) return
  const encoded = url.slice(header[0].length)
  if (encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return
  const picture = originalPicture(Buffer.from(encoded, 'base64'))
  if (picture?.format === header[1].toLowerCase()) return picture
}
