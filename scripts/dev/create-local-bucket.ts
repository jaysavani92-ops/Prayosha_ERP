/**
 * LOCAL DEVELOPMENT: creates the bucket on the S3 emulator and applies the
 * same CORS rules production uses (docs/deployment.md). Refuses to run
 * against AWS so it can never modify a real bucket.
 *
 *   npm run dev:bucket
 */
import { CreateBucketCommand, PutBucketCorsCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
if (!endpoint || !/^http:\/\/(127\.0\.0\.1|localhost|s3)(:\d+)?$/.test(endpoint)) {
  console.error('S3_ENDPOINT must point at the local emulator (http://127.0.0.1:9000)');
  process.exit(1);
}
if (!bucket) {
  console.error('S3_BUCKET is required');
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
});

try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`created bucket ${bucket}`);
} catch (error) {
  if (
    error instanceof S3ServiceException &&
    ['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)
  ) {
    console.log(`bucket ${bucket} already exists`);
  } else {
    throw error;
  }
}

const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ['PUT', 'GET'],
            AllowedHeaders: ['content-type', 'if-none-match', 'x-amz-checksum-sha256'],
            ExposeHeaders: ['etag'],
            MaxAgeSeconds: 600,
          },
        ],
      },
    }),
  );
  console.log(`applied CORS for ${origins.join(', ')}`);
} catch (error) {
  // Some emulators do not implement bucket CORS; uploads from tools like curl still work.
  console.warn('could not apply CORS:', error instanceof Error ? error.message : error);
}
