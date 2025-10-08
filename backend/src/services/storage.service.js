import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Storage } from "#config/storage.js";
import { ENV } from "#config/env.js";
import { v4 as uuidv4 } from "uuid";
import logger from "#config/logger.js";

export const uploadFile = async (
  fileBuffer,
  fileName,
  mimeType,
  folder = "uploads"
) => {
  try {
    const fileExtension = fileName.split(".").pop();
    const uniqueFileName = `${folder}/${uuidv4()}.${fileExtension}`;

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
    const fileUrl = ENV.STORAGE_PUBLIC_URL
      ? `${ENV.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${ENV.STORAGE_BUCKET_NAME}/${uniqueFileName}`
      : (() => {
          const urlParts = ENV.STORAGE_URL.split(".");
          const supabaseProjectId = urlParts[0].split("//")[1];
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
