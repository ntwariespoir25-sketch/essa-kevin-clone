const multer = require('multer');
const { MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, extOf } = require('./storage');

// Memory storage on purpose: every provider in utils/storage takes a buffer,
// and staging on local disk first would mean writing files that are never
// cleaned up when the provider call fails.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 5,
    fields: 10
  }
});

// Turns multer's own error shapes into the same JSON contract the rest of the
// API uses, so the client has one failure format to handle.
const describeMulterError = (err) => {
  if (!err) return null;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`;
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return 'A maximum of 5 files can be attached at once.';
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return 'Unexpected file field.';
    }
    return err.message;
  }
  return null;
};

// First gate, before anything is read into memory or scanned: the extension
// must be one we knowingly support. Content sniffing happens after this in
// utils/storage.scanBuffer.
const extensionAllowed = (filename) => ALLOWED_EXTENSIONS.has(extOf(filename));

module.exports = { upload, describeMulterError, extensionAllowed };
