import { z } from "zod";
import type { S3Connection } from "@/domain/s3/models";

/** Validates raw connection form input at the trust boundary. */
export const connectionSchema = z.object({
  endpoint: z.string().trim().url("Enter a valid URL, e.g. https://host"),
  accessKeyId: z.string().trim().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  region: z.string().trim().min(1).default("us-east-1"),
  forcePathStyle: z.boolean().default(true),
  skipTlsVerification: z.boolean().default(false),
});

export type ConnectionInput = z.infer<typeof connectionSchema>;

/** Reads a connection candidate from submitted form data. */
export function readConnectionForm(formData: FormData):
  | {
      success: true;
      data: S3Connection;
    }
  | {
      success: false;
      fieldErrors: Record<string, string>;
    } {
  const parsed = connectionSchema.safeParse({
    endpoint: formData.get("endpoint"),
    accessKeyId: formData.get("accessKeyId"),
    secretAccessKey: formData.get("secretAccessKey"),
    region: formData.get("region") || undefined,
    forcePathStyle: formData.get("forcePathStyle") === "on",
    skipTlsVerification: formData.get("skipTlsVerification") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { success: false, fieldErrors };
  }
  return { success: true, data: parsed.data };
}
