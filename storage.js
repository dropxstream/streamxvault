/**
 * Storage Abstraction Layer for StreamXvault
 * Supports local filesystem and Cloudflare R2 storage
 * Includes multipart upload for large files
 */

const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class LocalStorage {
  constructor(uploadDir) {
    this.uploadDir = uploadDir;
    this.mode = 'local';
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

  async getPresignedUploadUrl(filename, contentType) {
    return null;
  }

  async download(filename) {
    const filepath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath);
    }
    return null;
  }
  async createMultipartUpload(filename, contentType) { return null; }
  async getPresignedPartUrl(filename, uploadId, partNumber) { return null; }
  async completeMultipartUpload(filename, uploadId, parts) { return null; }
  async abortMultipartUpload(filename, uploadId) { return null; }
}

class R2Storage {
  constructor(config) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;
    this.mode = 'r2';
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

  async getPresignedUploadUrl(filename, contentType) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: filename,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });
    return url;
  }

  // ==================== Multipart Upload ====================

  async createMultipartUpload(filename, contentType) {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: filename,
      ContentType: contentType,
    });
    const response = await this.client.send(command);
    return response.UploadId;
  }

  async getPresignedPartUrl(filename, uploadId, partNumber) {
    const command = new UploadPartCommand({
      Bucket: this.bucketName,
      Key: filename,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });
    return url;
  }

  async completeMultipartUpload(filename, uploadId, parts) {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: filename,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map(p => ({
          ETag: p.etag,
          PartNumber: p.partNumber,
        })),
      },
    });
    await this.client.send(command);
    return this.getUrl(filename);
  }

  async abortMultipartUpload(filename, uploadId) {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: filename,
      UploadId: uploadId,
    });
    await this.client.send(command);
  }

  async download(filename) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
      });
      const response = await this.client.send(command);
      // Convert stream to buffer
      const streamToBuffer = (stream) =>
        new Promise((resolve, reject) => {
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
      return await streamToBuffer(response.Body);
    } catch (err) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
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
