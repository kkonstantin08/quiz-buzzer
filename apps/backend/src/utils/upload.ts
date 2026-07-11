import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Ensure the configured upload directory exists and is writable
export function ensureUploadDirExists() {
  const dir = config.uploadDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.accessSync(dir, fs.constants.W_OK);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, safeName);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Только JPEG, PNG и WebP разрешены'));
    }
  }
});

export async function validateFileSignature(filePath: string): Promise<boolean> {
  // Verify file signature (magic bytes)
  const { fileTypeFromFile } = await import('file-type');
  const fileType = await fileTypeFromFile(filePath);
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (!fileType || !allowedMimes.includes(fileType.mime)) {
    return false;
  }
  return true;
}

export function deleteUploadedFile(fileUrlOrPath: string | null | undefined) {
  if (!fileUrlOrPath) return;

  // Extract just the filename to prevent Path Traversal
  const filename = path.basename(fileUrlOrPath);
  const fullPath = path.join(config.uploadDir, filename);

  // Ensure the resolved path is actually inside the upload directory
  if (fullPath.startsWith(path.resolve(config.uploadDir)) && fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.error(`Failed to delete file: ${fullPath}`, err);
    }
  }
}
