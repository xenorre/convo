import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().optional(),
  LOG_TO_FILES: z.string().optional(),
  COOKIE_MAX_AGE_MS: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  ARCJET_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  CLIENT_URL: z.string().url().optional(),
  STORAGE_URL: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_BUCKET_NAME: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export function validateEnvOrThrow() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && !env.CLIENT_URL) {
    throw new Error("CLIENT_URL must be set in production");
  }
  return env;
}

const env = validateEnvOrThrow();

export const ENV = {
  PORT: env.PORT,
  NODE_ENV: env.NODE_ENV,
  LOG_LEVEL: env.LOG_LEVEL,
  LOG_TO_FILES: env.LOG_TO_FILES,
  COOKIE_MAX_AGE_MS: env.COOKIE_MAX_AGE_MS,
  DATABASE_URL: env.DATABASE_URL,
  JWT_SECRET: env.JWT_SECRET,
  JWT_EXPIRES_IN: env.JWT_EXPIRES_IN,
  ARCJET_KEY: env.ARCJET_KEY,
  EMAIL_FROM: env.EMAIL_FROM,
  EMAIL_FROM_NAME: env.EMAIL_FROM_NAME,
  RESEND_API_KEY: env.RESEND_API_KEY,
  CLIENT_URL: env.CLIENT_URL,
  STORAGE_URL: env.STORAGE_URL,
  STORAGE_PUBLIC_URL: env.STORAGE_PUBLIC_URL,
  STORAGE_ACCESS_KEY_ID: env.STORAGE_ACCESS_KEY_ID,
  STORAGE_SECRET_ACCESS_KEY: env.STORAGE_SECRET_ACCESS_KEY,
  STORAGE_BUCKET_NAME: env.STORAGE_BUCKET_NAME,
  REDIS_URL: env.REDIS_URL,
};
