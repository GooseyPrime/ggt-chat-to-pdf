export function zip(files: { name: string; data: Buffer | string }[]): Buffer;
export function unzip(buf: Buffer): { name: string; data: Buffer }[];
export function crc32(buf: Uint8Array): number;
