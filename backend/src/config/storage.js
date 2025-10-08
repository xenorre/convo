import { S3Client } from "@aws-sdk/client-s3";
import { ENV } from "./env.js";

export const s3Storage = new S3Client({
  region: "us-east-1",
  endpoint: ENV.STORAGE_URL,
  credentials: {
    accessKeyId: ENV.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: ENV.STORAGE_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
  signatureVersion: "v4",
  s3ForcePathStyle: true,
  requestHandler: {
    connectionTimeout: 30000,
    socketTimeout: 30000,
  },
});
