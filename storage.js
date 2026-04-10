/**
 * Storage Abstraction Layer for StreamXvault
 * Supports local filesystem and Cloudflare R2 storage
 */

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

class LocalStorage {
  constructor(uploadDir) {
    this.uploadDir = uploadDir;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  async upload(filename, buffer, mimetype) {
    const filepath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  }

  async delete(filename) {
    const filepath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  getUrl(filename) {
    return `/uploads/${filename}`;
  }
}

class R2Storage {
  constructor(config) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async upload(filename, buffer, mimetype) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: mimetype,
    });
    await this.client.send(command);
    return this.getUrl(filename);
  }

  async delete(filename) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: filename,
    });
    await this.client.send(command);
  }

  getUrl(filename) {
    return `${this.publicUrl}/${filename}`;
  }
}

function createStorage() {
  const mode = process.env.STORAGE_MODE || 'local';

  if (mode === 'r2') {
    console.log('📦 Using Cloudflare R2 storage');
    return new R2Storage({
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucketName: process.env.R2_BUCKET_NAME,
      publicUrl: process.env.R2_PUBLIC_URL,
    });
  }

  console.log('📁 Using local file storage');
  const uploadDir = path.join(__dirname, 'uploads');
  return new LocalStorage(uploadDir);
}

module.exports = { createStorage };
