import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { RequestHandler } from 'express';
import type { Prisma } from '@prisma/client';
import { config } from '../config';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
} as const;

type UploadUrl = `/uploads/${string}`;
type PersistResult<T> = { previousUrl: string | null | undefined; deletePrevious: boolean; result: T };
type UploadTransaction = Pick<Prisma.TransactionClient, 'hostUser' | 'hostSettings'>;
const uploadLocks = new Map<string, Promise<void>>();

export class InvalidUploadError extends Error {}

function temporaryUploadDir() {
  return path.join(path.resolve(config.uploadDir), '.staging');
}

function isDirectFile(filePath: string, directory: string) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedFile = path.resolve(filePath);
  return path.dirname(resolvedFile) === resolvedDirectory ? resolvedFile : null;
}

function uploadPathFromUrl(url: string | null | undefined) {
  if (!url?.startsWith('/uploads/')) return null;

  const filename = url.slice('/uploads/'.length);
  if (!filename || filename !== path.basename(filename) || filename !== path.posix.basename(filename) || filename.includes('\\') || path.posix.normalize(filename) !== filename) {
    return null;
  }

  return isDirectFile(path.resolve(config.uploadDir, filename), config.uploadDir);
}

async function unlinkFile(filePath: string | null | undefined) {
  if (!filePath) return false;
  try {
    const stat = await fsPromises.stat(filePath);
    if (!stat.isFile()) return false;
    await fsPromises.unlink(filePath);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function ensureUploadDirExists() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.mkdirSync(temporaryUploadDir(), { recursive: true });
  fs.accessSync(config.uploadDir, fs.constants.W_OK);
}

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fsPromises.mkdir(temporaryUploadDir(), { recursive: true })
        .then(() => callback(null, temporaryUploadDir()))
        .catch((error) => callback(error, ''));
    },
    filename: (_req, _file, callback) => callback(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: MAX_FILE_SIZE },
});

export function receiveUpload(field: string): RequestHandler {
  const middleware = uploadMiddleware.single(field);
  return (req, res, next) => {
    middleware(req, res, (error: any) => {
      if (!error) return next();
      void removeTemporaryUpload(req.file?.path).finally(() => {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Файл слишком большой. Максимальный размер 5 МБ.' });
          return;
        }
        res.status(400).json({ error: 'Ошибка загрузки файла' });
      });
    });
  };
}

export async function removeTemporaryUpload(filePath: string | undefined) {
  const safePath = filePath && isDirectFile(filePath, temporaryUploadDir());
  return unlinkFile(safePath);
}

export async function deleteUploadedFile(fileUrl: string | null | undefined) {
  return unlinkFile(uploadPathFromUrl(fileUrl));
}

export async function countUploadReferences(tx: UploadTransaction, url: string | null | undefined) {
  if (!uploadPathFromUrl(url)) return 0;
  const [avatars, logos, backgrounds] = await Promise.all([
    tx.hostUser.count({ where: { avatarUrl: url } }),
    tx.hostSettings.count({ where: { customLogoUrl: url } }),
    tx.hostSettings.count({ where: { customBgUrl: url } }),
  ]);
  return avatars + logos + backgrounds;
}

// ponytail: in-memory lock is for this single backend instance; use a distributed lock if deployment scales out.
export async function withUploadLock<T>(key: string, task: () => Promise<T>) {
  const previous = uploadLocks.get(key) ?? Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  uploadLocks.set(key, tail);

  await previous;
  try {
    return await task();
  } finally {
    release!();
    if (uploadLocks.get(key) === tail) uploadLocks.delete(key);
  }
}

async function publishTemporaryUpload(filePath: string): Promise<UploadUrl> {
  const temporaryPath = isDirectFile(filePath, temporaryUploadDir());
  if (!temporaryPath) throw new InvalidUploadError('Invalid temporary upload path');

  const { fileTypeFromFile } = await import('file-type');
  const type = await fileTypeFromFile(temporaryPath);
  const extension = type && extensions[type.mime as keyof typeof extensions];
  if (!extension) throw new InvalidUploadError('Invalid file signature. Only JPEG, PNG, WebP are allowed.');

  await fsPromises.mkdir(config.uploadDir, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
  await fsPromises.rename(temporaryPath, path.resolve(config.uploadDir, filename));
  return `/uploads/${filename}`;
}

export async function saveUploadedFile<T>(
  file: Express.Multer.File,
  persist: (url: UploadUrl) => Promise<PersistResult<T>>,
) {
  let url: UploadUrl | undefined;
  try {
    url = await publishTemporaryUpload(file.path);
    const persisted = await persist(url);
    if (persisted.deletePrevious) {
      try {
        await deleteUploadedFile(persisted.previousUrl);
      } catch (error) {
        console.error('Failed to delete replaced upload:', error);
      }
    }
    return { url, result: persisted.result };
  } catch (error) {
    if (url) {
      try {
        await deleteUploadedFile(url);
      } catch (cleanupError) {
        console.error('Failed to remove unpublished upload:', cleanupError);
      }
    }
    throw error;
  } finally {
    await removeTemporaryUpload(file.path);
  }
}
