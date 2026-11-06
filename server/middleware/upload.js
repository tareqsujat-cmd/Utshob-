import multer from 'multer';
import { UPLOAD_MIME_TYPES, UPLOAD_MAX_BYTES } from '../config/constants.js';
import { httpError } from '../utils/httpError.js';

// Reads one uploaded file from a multipart form into memory (req.file.buffer).
// Rejects files over 1 MB and anything that is not PDF, PNG or JPG.
// Usage in a route: upload.single('file')
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: (req, file, callback) => {
    if (UPLOAD_MIME_TYPES.includes(file.mimetype)) callback(null, true);
    else callback(httpError(400, 'Only PDF, PNG or JPG files are allowed'));
  },
});
