import { z } from "zod";

const envSchema = z.object({
  // Required env vars
  VITE_SUPABASE_URL: z
    .string()
    .url("VITE_SUPABASE_URL must be a valid URL")
    .refine(
      (val) => {
        if (import.meta.env.PROD) {
          return val.startsWith("https:");
        }
        return true;
      },
      {
        message:
          "VITE_SUPABASE_URL must use https in production environments",
      }
    )
    .transform((val) => val.trim()),

  VITE_STELLAR_RPC_URL: z
    .string()
    .url("VITE_STELLAR_RPC_URL must be a valid URL")
    .refine(
      (val) => {
        if (import.meta.env.PROD) {
          return val.startsWith("https:");
        }
        return true;
      },
      {
        message:
          "VITE_STELLAR_RPC_URL must use https in production environments",
      }
    )
    .transform((val) => val.trim()),

  VITE_API_BASE_URL: z
    .string()
    .url("VITE_API_BASE_URL must be a valid URL")
    .refine(
      (val) => {
        if (import.meta.env.PROD) {
          return val.startsWith("https:");
        }
        return true;
      },
      {
        message:
          "VITE_API_BASE_URL must use https in production environments",
      }
    )
    .transform((val) => val.trim()),

  VITE_APP_URL: z
    .string()
    .url("VITE_APP_URL must be a valid URL")
    .refine(
      (val) => {
        if (import.meta.env.PROD) {
          return val.startsWith("https:");
        }
        return true;
      },
      {
        message:
          "VITE_APP_URL must use https in production environments",
      }
    )
    .transform((val) => val.trim()),

  // Optional env vars with defaults
  NODE_ENV: z.string().optional().default("development"),
});

export const env = envSchema.parse(import.meta.env);

export type Env = z.infer<typeof envSchema>;
