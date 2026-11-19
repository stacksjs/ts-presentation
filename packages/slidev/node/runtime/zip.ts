import { Buffer } from 'node:buffer'

export interface ZipPart {
  name: string
  data: string | Uint8Array<ArrayBuffer>
}

/** Store already-compressed slide images without inflating work or requiring a ZIP executable. */
export function zipParts(parts: readonly ZipPart[]): Blob {
  const records: BlobPart[] = []
  const central: BlobPart[] = []
  let offset = 0
  let centralSize = 0
  const names = new Set<string>()
  for (const part of parts) {
    if (names.has(part.name)) throw new Error(`Duplicate ZIP part: ${part.name}`)
    names.add(part.name)
    const name = Buffer.from(part.name)
    const data = typeof part.data === 'string' ? Buffer.from(part.data) : part.data
    if (name.length > 0xFFFF || data.length > 0xFFFFFFFF || offset + 30 + name.length + data.length > 0xFFFFFFFF)
      throw new Error('PowerPoint exceeds the ZIP32 size limit')
    const crc = Bun.hash.crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034B50)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    records.push(local, name, data)

    const catalog = Buffer.alloc(46)
    catalog.writeUInt32LE(0x02014B50)
    catalog.writeUInt16LE(20, 4)
    catalog.writeUInt16LE(20, 6)
    catalog.writeUInt16LE(0x800, 8)
    catalog.writeUInt16LE(0x21, 14)
    catalog.writeUInt32LE(crc, 16)
    catalog.writeUInt32LE(data.length, 20)
    catalog.writeUInt32LE(data.length, 24)
    catalog.writeUInt16LE(name.length, 28)
    catalog.writeUInt32LE(offset, 42)
    central.push(catalog, name)

    offset += local.length + name.length + data.length
    centralSize += catalog.length + name.length
  }
  if (parts.length > 0xFFFF || offset + centralSize > 0xFFFFFFFF) throw new Error('PowerPoint exceeds the ZIP32 directory limit')

  const footer = Buffer.alloc(22)
  footer.writeUInt32LE(0x06054B50)
  footer.writeUInt16LE(parts.length, 8)
  footer.writeUInt16LE(parts.length, 10)
  footer.writeUInt32LE(centralSize, 12)
  footer.writeUInt32LE(offset, 16)
  return new Blob([...records, ...central, footer])
}
