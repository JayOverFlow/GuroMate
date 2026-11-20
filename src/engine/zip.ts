import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

interface ZipCentralEntry {
  nameBytes: Buffer;
  name: string;
  versionMade: number;
  versionNeeded: number;
  flags: number;
  method: number;
  modTime: number;
  modDate: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  internalAttr: number;
  externalAttr: number;
  localHeaderOffset: number;
  cdExtra: Buffer;
  comment: Buffer;
}

function findEocdOffset(buf: Buffer): number {
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  throw new Error("Invalid ZIP archive: End of Central Directory not found.");
}

function parseCentralDirectory(buf: Buffer): ZipCentralEntry[] {
  const eocdOffset = findEocdOffset(buf);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipCentralEntry[] = [];
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error("Invalid ZIP archive: corrupt Central Directory header.");
    }
    const versionMade = buf.readUInt16LE(pos + 4);
    const versionNeeded = buf.readUInt16LE(pos + 6);
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const modTime = buf.readUInt16LE(pos + 12);
    const modDate = buf.readUInt16LE(pos + 14);
    const crc = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const internalAttr = buf.readUInt16LE(pos + 36);
    const externalAttr = buf.readUInt32LE(pos + 38);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    const nameStart = pos + 46;
    const nameBytes = buf.subarray(nameStart, nameStart + nameLen);
    const cdExtra = buf.subarray(nameStart + nameLen, nameStart + nameLen + extraLen);
    const comment = buf.subarray(
      nameStart + nameLen + extraLen,
      nameStart + nameLen + extraLen + commentLen,
    );

    entries.push({
      nameBytes,
      name: nameBytes.toString("utf8"),
      versionMade,
      versionNeeded,
      flags,
      method,
      modTime,
      modDate,
      crc,
      compressedSize,
      uncompressedSize,
      internalAttr,
      externalAttr,
      localHeaderOffset,
      cdExtra,
      comment,
    });
    pos = nameStart + nameLen + extraLen + commentLen;
  }
  return entries;
}

function getLocalPayloadSlice(
  buf: Buffer,
  entry: ZipCentralEntry,
): { payload: Buffer; localExtra: Buffer } {
  const lh = entry.localHeaderOffset;
  if (buf.readUInt32LE(lh) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header for ${entry.name}`);
  }
  const localNameLen = buf.readUInt16LE(lh + 26);
  const localExtraLen = buf.readUInt16LE(lh + 28);
  const extraStart = lh + 30 + localNameLen;
  const dataStart = extraStart + localExtraLen;
  return {
    localExtra: buf.subarray(extraStart, dataStart),
    payload: buf.subarray(dataStart, dataStart + entry.compressedSize),
  };
}

/** Reads and decompresses a single file entry from an in-memory ZIP buffer. */
export function readZipEntry(zipBuffer: Buffer, entryName: string): Buffer {
  const entries = parseCentralDirectory(zipBuffer);
  const entry = entries.find((e) => e.name === entryName);
  if (!entry) {
    throw new Error(`ZIP entry not found: ${entryName}`);
  }
  const { payload } = getLocalPayloadSlice(zipBuffer, entry);
  if (entry.method === 0) return Buffer.from(payload);
  if (entry.method === 8) return inflateRawSync(payload);
  throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
}

interface ZipWriteRecord {
  nameBytes: Buffer;
  versionMade: number;
  versionNeeded: number;
  flags: number;
  method: number;
  modTime: number;
  modDate: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  internalAttr: number;
  externalAttr: number;
  localExtra: Buffer;
  cdExtra: Buffer;
  comment: Buffer;
  payload: Buffer;
}

function assembleZipArchive(records: ReadonlyArray<ZipWriteRecord>): Buffer {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let currentOffset = 0;

  for (const r of records) {
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(r.versionNeeded, 4);
    lh.writeUInt16LE(r.flags, 6);
    lh.writeUInt16LE(r.method, 8);
    lh.writeUInt16LE(r.modTime, 10);
    lh.writeUInt16LE(r.modDate, 12);
    lh.writeUInt32LE(r.crc, 14);
    lh.writeUInt32LE(r.compressedSize, 18);
    lh.writeUInt32LE(r.uncompressedSize, 22);
    lh.writeUInt16LE(r.nameBytes.length, 26);
    lh.writeUInt16LE(r.localExtra.length, 28);

    const localOffset = currentOffset;
    localParts.push(lh, r.nameBytes, r.localExtra, r.payload);
    currentOffset +=
      lh.length + r.nameBytes.length + r.localExtra.length + r.payload.length;

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(r.versionMade, 4);
    cd.writeUInt16LE(r.versionNeeded, 6);
    cd.writeUInt16LE(r.flags, 8);
    cd.writeUInt16LE(r.method, 10);
    cd.writeUInt16LE(r.modTime, 12);
    cd.writeUInt16LE(r.modDate, 14);
    cd.writeUInt32LE(r.crc, 16);
    cd.writeUInt32LE(r.compressedSize, 20);
    cd.writeUInt32LE(r.uncompressedSize, 24);
    cd.writeUInt16LE(r.nameBytes.length, 28);
    cd.writeUInt16LE(r.cdExtra.length, 30);
    cd.writeUInt16LE(r.comment.length, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(r.internalAttr, 36);
    cd.writeUInt32LE(r.externalAttr, 38);
    cd.writeUInt32LE(localOffset, 42);

    cdParts.push(cd, r.nameBytes, r.cdExtra, r.comment);
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(records.length, 8);
  eocd.writeUInt16LE(records.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(currentOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

/** Replaces a single entry in an in-memory ZIP buffer while preserving all other entries. */
export function replaceZipEntry(
  zipBuffer: Buffer,
  entryName: string,
  nextData: Buffer,
): Buffer {
  const entries = parseCentralDirectory(zipBuffer);
  let replaced = false;

  const records: ZipWriteRecord[] = entries.map((entry) => {
    const { payload: origPayload, localExtra } = getLocalPayloadSlice(zipBuffer, entry);
    if (entry.name === entryName) {
      replaced = true;
      const payload = deflateRawSync(nextData);
      return {
        nameBytes: entry.nameBytes,
        versionMade: entry.versionMade,
        versionNeeded: entry.versionNeeded,
        flags: 0,
        method: 8,
        modTime: entry.modTime,
        modDate: entry.modDate,
        crc: crc32(nextData) >>> 0,
        compressedSize: payload.length,
        uncompressedSize: nextData.length,
        internalAttr: entry.internalAttr,
        externalAttr: entry.externalAttr,
        localExtra: Buffer.alloc(0),
        cdExtra: entry.cdExtra,
        comment: entry.comment,
        payload,
      };
    }

    return {
      nameBytes: entry.nameBytes,
      versionMade: entry.versionMade,
      versionNeeded: entry.versionNeeded,
      flags: entry.flags & ~0x0008,
      method: entry.method,
      modTime: entry.modTime,
      modDate: entry.modDate,
      crc: entry.crc,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      internalAttr: entry.internalAttr,
      externalAttr: entry.externalAttr,
      localExtra,
      cdExtra: entry.cdExtra,
      comment: entry.comment,
      payload: origPayload,
    };
  });

  if (!replaced) {
    throw new Error(`ZIP entry not found for replacement: ${entryName}`);
  }

  return assembleZipArchive(records);
}

/** Creates an in-memory ZIP archive from a list of named file buffers. */
export function createZip(
  entries: ReadonlyArray<{ name: string; data: Buffer }>,
): Buffer {
  const empty = Buffer.alloc(0);
  const records: ZipWriteRecord[] = entries.map((entry) => {
    const payload = deflateRawSync(entry.data);
    return {
      nameBytes: Buffer.from(entry.name, "utf8"),
      versionMade: 20,
      versionNeeded: 20,
      flags: 0x0800,
      method: 8,
      modTime: 0,
      modDate: 0,
      crc: crc32(entry.data) >>> 0,
      compressedSize: payload.length,
      uncompressedSize: entry.data.length,
      internalAttr: 0,
      externalAttr: 0,
      localExtra: empty,
      cdExtra: empty,
      comment: empty,
      payload,
    };
  });
  return assembleZipArchive(records);
}
