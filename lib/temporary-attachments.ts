import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateUploadFileNames } from "./file-upload";

export const MAX_TEMP_ATTACHMENT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEMP_ATTACHMENT_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_TEMP_ATTACHMENT_REQUEST_BYTES = MAX_TEMP_ATTACHMENT_TOTAL_BYTES + 1024 * 1024;

export interface TemporaryAttachment {
  name: string;
  path: string;
  size: number;
}

export async function saveTemporaryAttachments(
  files: File[],
  tempRoot = tmpdir(),
): Promise<TemporaryAttachment[]> {
  const validationError = validateUploadFileNames(files.map((file) => file.name));
  if (validationError) throw new Error(validationError);

  if (files.some((file) => file.size > MAX_TEMP_ATTACHMENT_FILE_BYTES)) {
    throw new Error("Each attachment must be 25MB or smaller");
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TEMP_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Attachments must total 100MB or less");
  }

  const directory = await mkdtemp(path.join(tempRoot, "pi-web-attachments-"));
  try {
    const attachments: TemporaryAttachment[] = [];
    for (const file of files) {
      const destination = path.join(directory, file.name);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
      attachments.push({ name: file.name, path: destination, size: bytes.byteLength });
    }
    return attachments;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
