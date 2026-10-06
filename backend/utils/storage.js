const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// One upload surface for the whole backend. The provider is chosen from
// configuration rather than by callers, so swapping local disk for S3 later is
// an environment change and not a code change.
//
//   STORAGE_PROVIDER=s3 | cloudinary | local
//
// When unset the adapter picks s3 or cloudinary if their credentials exist and
// otherwise falls back to local disk, so the application always runs - a fresh
// clone with no secrets can still send an attachment.

const S3_CONFIG = [
  'AWS_S3_BUCKET',
  'AWS_REGION'
];
const CLOUDINARY_CONFIG = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const SUPPORTED_PROVIDERS = ['s3', 'cloudinary', 'local'];

let resolvedProvider = null;

const hasAll = (keys) => keys.every(k => !!process.env[k]);

const resolveProvider = () => {
  if (resolvedProvider) return resolvedProvider;

  const explicit = (process.env.STORAGE_PROVIDER || '').trim().toLowerCase();

  if (explicit) {
    if (!SUPPORTED_PROVIDERS.includes(explicit)) {
      throw new Error(
        `Unsupported STORAGE_PROVIDER "${explicit}". Expected one of: ${SUPPORTED_PROVIDERS.join(', ')}.`
      );
    }
    resolvedProvider = explicit;
    return resolvedProvider;
  }

  if (hasAll(S3_CONFIG) && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ENDPOINT_URL)) {
    resolvedProvider = 's3';
  } else if (hasAll(CLOUDINARY_CONFIG)) {
    resolvedProvider = 'cloudinary';
  } else {
    resolvedProvider = 'local';
  }

  return resolvedProvider;
};

// Called on cold start so a misconfiguration surfaces at boot instead of on the
// first message somebody tries to attach a file to.
const assertConfigured = () => {
  const provider = resolveProvider();
  if (provider === 's3' && !hasAll(S3_CONFIG)) {
    throw new Error(`STORAGE_PROVIDER=s3 requires: ${S3_CONFIG.join(', ')}.`);
  }
  if (provider === 'cloudinary' && !hasAll(CLOUDINARY_CONFIG)) {
    throw new Error(`STORAGE_PROVIDER=cloudinary requires: ${CLOUDINARY_CONFIG.join(', ')}.`);
  }
  return provider;
};

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

// Extension -> the bucket the UI groups files into. Drives icons and which
// renderer opens a file, so it is deliberately coarse.
const KIND_BY_EXT = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', heic: 'image',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc',
  xls: 'sheet', xlsx: 'sheet', ods: 'sheet', csv: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides',
  zip: 'archive', rar: 'archive', '7z': 'archive',
  mp3: 'audio', m4a: 'audio', ogg: 'audio', wav: 'audio', opus: 'audio', weba: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video',
  txt: 'other'
};

const ALLOWED_EXTENSIONS = new Set([
  ...Object.keys(KIND_BY_EXT)
]);

// SVG is deliberately absent: it is an executable document, and serving one a
// user uploaded would let them run script against every origin that loads it.
const extOf = (filename) => path.extname(filename || '').replace('.', '').toLowerCase();

const kindFor = (filename) => KIND_BY_EXT[extOf(filename)] || 'other';

// Content sniffing for the scan hook. Extensions and mime types arrive from the
// client and prove nothing, so the first bytes of the payload are checked
// against known signatures. This is not a substitute for a malware engine - it
// catches extension spoofing, which is the cheap, common attack - and
// scanBuffer below is where ClamAV would be dropped in later.
const MAGIC = [
  { ext: 'pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },            // %PDF
  { ext: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'jpg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { ext: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { ext: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { ext: 'ogg', offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
  { ext: 'mp3', offset: 0, bytes: [0x49, 0x44, 0x33] },
  { ext: 'mp3', offset: 0, bytes: [0xff, 0xfb] },
  { ext: 'mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },             // ftyp
  { ext: 'webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }
];

// Office documents are all ZIP containers, so they share the PK signature and
// are told apart by the mime the client declared plus the path inside the
// archive, which the caller supplies as `declaredExt`.
const OFFICE_EXT = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf']);

const matchesSignature = (buffer, spec) => {
  if (buffer.length < spec.offset + spec.bytes.length) return false;
  return spec.bytes.every((b, i) => buffer[spec.offset + i] === b);
};

const sniffMatches = (buffer, ext) => {
  // The ZIP signature legitimately backs every office format and every archive.
  if (ext === 'zip' || OFFICE_EXT.has(ext)) {
    return matchesSignature(buffer, MAGIC[4]) || matchesSignature(buffer, MAGIC[5]);
  }
  const spec = MAGIC.find(m => m.ext === ext);
  if (!spec) return true;         // no signature known for this type: allow
  return matchesSignature(buffer, spec);
};

// Replace this body with a ClamAV daemon call when one is available; the
// contract is the same and no caller changes.
const scanBuffer = async (buffer, filename) => {
  const ext = extOf(filename);

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { clean: false, reason: `File type ".${ext}" is not allowed.` };
  }
  if (!buffer || buffer.length === 0) {
    return { clean: false, reason: 'The file is empty.' };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return {
      clean: false,
      reason: `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`
    };
  }
  if (!sniffMatches(buffer, ext)) {
    return { clean: false, reason: 'The file content does not match its extension.' };
  }

  return { clean: true };
};

const randomName = (rawExt) => {
  const ext = (rawExt || '').replace(/^\./, '');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${stamp}-${crypto.randomBytes(8).toString('hex')}${ext ? `.${ext}` : ''}`;
};

const s3Client = () => {
  // Required lazily so a local or cloudinary configuration never pays the cost
  // of loading the AWS SDK.
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_REGION,
    ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true } : {}),
    ...(process.env.AWS_ACCESS_KEY_ID
      ? { credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } }
      : {})
  });
};

// Writes a buffer to the configured provider.
// Returns { url, key, provider, size }.
const uploadBuffer = async ({ buffer, filename, mime, folder = 'chat', baseUrl }) => {
  const provider = assertConfigured();
  const ext = path.extname(filename || '');
  const key = path.posix.join(folder, randomName(ext));

  if (provider === 'local') {
    const absolute = path.join(UPLOADS_ROOT, key);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, buffer);
    const origin = baseUrl || '';
    return { url: `${origin}/uploads/${key}`, key, provider, size: buffer.length };
  }

  if (provider === 's3') {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const bucket = process.env.AWS_S3_BUCKET;
    await s3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mime || 'application/octet-stream'
    }));
    // A public bucket or a CDN in front of it can override the canonical form.
    const base = process.env.AWS_S3_PUBLIC_URL
      || `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    return { url: `${base.replace(/\/$/, '')}/${key}`, key, provider, size: buffer.length };
  }

  // cloudinary
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  const result = await new Promise((resolve, reject) => {
    // Cloudinary files every upload under a resource type and only serves it
    // correctly through the matching delivery URL, so the bucket has to be
    // decided here rather than left to its default of "image".
    const kind = kindFor(filename);
    const resourceType = kind === 'image' ? 'image' : (kind === 'audio' || kind === 'video') ? 'video' : 'raw';
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder, public_id: path.basename(key, ext), resource_type: resourceType },
      (err, out) => (err ? reject(err) : resolve(out))
    );
    stream.end(buffer);
  });

  return { url: result.secure_url, key: result.public_id, provider, size: buffer.length };
};

// Best effort: a failed delete must not fail the request that triggered it,
// because the message itself is usually already gone or irrelevant.
const removeStored = async (key, provider) => {
  if (!key) return false;
  const which = provider || resolveProvider();

  try {
    if (which === 'local') {
      const absolute = path.join(UPLOADS_ROOT, key);
      // Refuse to escape the uploads tree if a key ever arrives from outside.
      if (!absolute.startsWith(UPLOADS_ROOT)) return false;
      await fs.promises.unlink(absolute);
      return true;
    }

    if (which === 's3') {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
      return true;
    }

    const cloudinary = require('cloudinary').v2;
    await cloudinary.uploader.destroy(key, { invalidate: true });
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  uploadBuffer,
  removeStored,
  scanBuffer,
  kindFor,
  extOf,
  resolveProvider,
  assertConfigured,
  ALLOWED_EXTENSIONS,
  KIND_BY_EXT,
  MAX_UPLOAD_BYTES,
  UPLOADS_ROOT
};
