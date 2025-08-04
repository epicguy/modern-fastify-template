/**
 * helpers/s3.js - Helper for S3 operations
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
// Local
const { s3: config } = require('../config');

// Initialize S3 client
const client = new S3Client({ region: config.region, credentials: config.credentials });

// Generate a random string for the S3 key
const generateS3Filename = (id, imageType) => {
  const s3Key = crypto
    .createHash('md5')
    .update('forS3' + id)
    .digest('hex')
    .slice(1, 1 + 16);
  return s3Key + '.' + imageType;
};
// Generate a signed URL for uploading an avatar
const getAvatarUploadUrl = async (ctx, id, imageType) => {
  const f = 's3.getAvatarUploadUrl:';
  const start_time = Date.now();
  const avatar_file = generateS3Filename(id, imageType);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: `avatars/${avatar_file}`,
    ContentType: `image/${imageType}`,
  });
  const signedUrl = await getSignedUrl(client, command, { expiresIn: config.signedUrlExpirationSecs });
  const result = { uploadUrl: signedUrl, avatar_file };
  const time_ms = Date.now() - start_time;
  ctx.log(f, { result, time_ms });
  return result;
};

module.exports = { getAvatarUploadUrl };
