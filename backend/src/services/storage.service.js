import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { s3Storage } from "#config/storage.js";
import { ENV } from "#config/env.js";
import { v4 as uuidv4 } from "uuid";
import logger from "#config/logger.js";

// Where uploaded files live. "local" keeps them on disk (a Docker volume in
// production) and the app serves them itself under /uploads; "s3" puts them
// in an S3-compatible bucket such as Supabase Storage. Without a choice, a
// configured bucket wins.
export const STORAGE_DRIVER = ENV.STORAGE_DRIVER || (ENV.STORAGE_URL ? "s3" : "local");
export const UPLOAD_DIR = path.resolve(
  ENV.UPLOAD_DIR || fileURLToPath(new URL("../../uploads", import.meta.url))
);
export const UPLOADS_PATH = "/uploads";
// Every upload, of any kind, is at most this big, so a few large files can't
// fill the server's disk.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "2 MB";

// The stored name's extension comes from the checked type, never from the
// uploaded name, so a file can't be served back as something else (say HTML).
const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

// A stored file's place on disk; refuses anything outside the upload folder.
const localPath = (key) => {
  const filePath = path.resolve(UPLOAD_DIR, key);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error("File path is outside the upload folder");
  }
  return filePath;
};

// Written under a temporary name first, so a half-written file is never served.
const saveLocally = async (key, fileBuffer) => {
  const filePath = localPath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  const partial = `${filePath}.${uuidv4()}.partial`;
  try {
    await writeFile(partial, fileBuffer, { flag: "wx" });
    await rename(partial, filePath);
  } catch (error) {
    await unlink(partial).catch(() => {});
    throw error;
  }
  return `${UPLOADS_PATH}/${key}`;
};

// A full address for use outside the app, such as in a data export; files on
// this server are stored by path only, so the database doesn't depend on the
// domain.
export const absoluteFileUrl = (fileUrl) =>
  fileUrl?.startsWith("/") && ENV.CLIENT_URL ? new URL(fileUrl, ENV.CLIENT_URL).href : fileUrl;

export const uploadFile = async (
  fileBuffer,
  fileName,
  mimeType,
  folder = "uploads"
) => {
  try {
    const fileExtension = EXTENSIONS[mimeType];
    if (!fileExtension) throw new Error(`Unsupported file type: ${mimeType}`);
    if (fileBuffer.length > MAX_UPLOAD_BYTES) throw new Error(`File is larger than ${MAX_UPLOAD_LABEL}`);
    const uniqueFileName = `${folder}/${uuidv4()}.${fileExtension}`;

    if (STORAGE_DRIVER === "local") {
      const fileUrl = await saveLocally(uniqueFileName, fileBuffer);
      logger.info("File saved", { fileName: uniqueFileName, fileSize: fileBuffer.length, mimeType });
      return fileUrl;
    }

    const command = new PutObjectCommand({
      Bucket: ENV.STORAGE_BUCKET_NAME,
      Key: uniqueFileName,
      Body: fileBuffer,
      ContentType: mimeType,
      ContentDisposition: "inline",
      CacheControl: "max-age=31536000",
    });

    await s3Storage.send(command);

    // Build public URL
    let supabaseProjectId = null;
    const fileUrl = ENV.STORAGE_PUBLIC_URL
      ? `${ENV.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${ENV.STORAGE_BUCKET_NAME}/${uniqueFileName}`
      : (() => {
          const urlParts = ENV.STORAGE_URL.split(".");
          supabaseProjectId = urlParts[0].split("//")[1];
          return `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${ENV.STORAGE_BUCKET_NAME}/${uniqueFileName}`;
        })();

    logger.info("File uploaded successfully", {
      fileName: uniqueFileName,
      fileSize: fileBuffer.length,
      mimeType,
      publicUrl: fileUrl,
      projectId: supabaseProjectId,
    });

    return fileUrl;
  } catch (error) {
    logger.error("Failed to upload file to storage", {
      error: error.message,
      fileName,
      mimeType,
      folder,
    });
    throw new Error("Failed to upload file");
  }
};

export const deleteFile = async (fileUrl) => {
  try {
    // Decided by the address, so files saved before a driver change still go.
    if (fileUrl.startsWith(`${UPLOADS_PATH}/`)) {
      await unlink(localPath(fileUrl.slice(UPLOADS_PATH.length + 1))).catch((error) => {
        // Already gone is what we wanted.
        if (error.code !== "ENOENT") throw error;
      });
      logger.info("File deleted successfully", { fileUrl });
      return true;
    }

    const urlParts = fileUrl.split("/");
    const publicIndex = urlParts.findIndex((part) => part === "public");

    if (publicIndex === -1 || publicIndex + 2 >= urlParts.length) {
      throw new Error("Invalid Supabase file URL format");
    }

    const key = urlParts.slice(publicIndex + 2).join("/");

    const command = new DeleteObjectCommand({
      Bucket: ENV.STORAGE_BUCKET_NAME,
      Key: key,
    });

    await s3Storage.send(command);

    logger.info("File deleted successfully", {
      fileUrl,
      key,
    });

    return true;
  } catch (error) {
    logger.error("Failed to delete file from storage", {
      error: error.message,
      fileUrl,
    });
    throw new Error("Failed to delete file");
  }
};

export const uploadProfileImage = async (
  fileBuffer,
  fileName,
  mimeType,
  userId
) => {
  return uploadFile(fileBuffer, fileName, mimeType, `profile-images/${userId}`);
};

export const uploadMessageFile = async (
  fileBuffer,
  fileName,
  mimeType,
  senderId,
  receiverId
) => {
  return uploadFile(
    fileBuffer,
    fileName,
    mimeType,
    `message-files/${senderId}/${receiverId}`
  );
};
