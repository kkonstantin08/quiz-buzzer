import { deleteUploadedFile, validateFileSignature } from '../../utils/upload';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';

describe('Upload Utility', () => {
  beforeAll(() => {
    config.uploadDir = path.join(__dirname, '../../../test-uploads');
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(config.uploadDir)) {
      fs.rmSync(config.uploadDir, { recursive: true, force: true });
    }
  });

  it('should reject invalid file signatures', async () => {
    const testFile = path.join(config.uploadDir, 'test-invalid.txt');
    fs.writeFileSync(testFile, 'just some text, not an image');
    
    const isValid = await validateFileSignature(testFile);
    expect(isValid).toBe(false);

    fs.unlinkSync(testFile);
  });

  it('should prevent path traversal when deleting files', () => {
    // Create a dummy file outside the upload directory (if possible in test env)
    const testOutDir = path.join(config.uploadDir, '../dummy_out');
    if (!fs.existsSync(testOutDir)) fs.mkdirSync(testOutDir, { recursive: true });
    
    const testFile = path.join(testOutDir, 'test-delete.txt');
    fs.writeFileSync(testFile, 'test content');

    // Attempt to delete it via path traversal
    deleteUploadedFile('../dummy_out/test-delete.txt');

    // File should still exist because path traversal is blocked
    expect(fs.existsSync(testFile)).toBe(true);

    fs.unlinkSync(testFile);
    fs.rmdirSync(testOutDir);
  });

  it('should delete valid files within upload directory', () => {
    const testFile = path.join(config.uploadDir, 'valid-delete.png');
    fs.writeFileSync(testFile, 'fake png content');

    deleteUploadedFile('/uploads/valid-delete.png');

    expect(fs.existsSync(testFile)).toBe(false);
  });
});
