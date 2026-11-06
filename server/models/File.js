import mongoose from 'mongoose';

// An uploaded document (e.g. a trade licence scan). Stored inside MongoDB because
// Vercel's serverless functions have no permanent disk. Max 1 MB (checked by multer).
const fileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false }, // the bytes; only loaded when downloading
  },
  { timestamps: true }
);

export const File = mongoose.model('File', fileSchema);
