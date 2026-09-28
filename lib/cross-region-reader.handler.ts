import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";

const s3 = new S3Client({});
const TIMEOUT_MS = 60_000;
const RETRY_INTERVAL_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNoSuchKey(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "NoSuchKey" || (error as any).Code === "NoSuchKey";
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; Code?: unknown };
    return candidate.name === "NoSuchKey" || candidate.Code === "NoSuchKey";
  }

  return false;
}

async function readFile(
  bucketName: string,
  fileKey: string,
): Promise<Record<string, any>> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucketName, Key: fileKey }),
      );

      if (!response.Body) {
        throw new Error(`S3 object ${fileKey} in ${bucketName} returned no body`);
      }

      const body = await response.Body.transformToString();
      const parsed = JSON.parse(body);

      if (
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        parsed === null
      ) {
        throw new Error(`File ${fileKey} must contain a JSON object`);
      }
      return parsed;
    } catch (e) {
      if (!isNoSuchKey(e)) throw e;
      await sleep(RETRY_INTERVAL_MS);
    }
  }

  throw new Error(
    `File ${fileKey} did not appear in ${bucketName} within ${TIMEOUT_MS / 1000}s`,
  );
}

function validateProperties(resourceProperties: any) {
  if (!resourceProperties || typeof resourceProperties !== "object") {
    throw new Error("ResourceProperties must be a valid object");
  }

  const { bucketName, fileKeys } = resourceProperties;

  if (typeof bucketName !== "string" || bucketName.trim().length === 0) {
    throw new Error("ResourceProperties.bucketName must be a non-empty string");
  }

  if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
    throw new Error("ResourceProperties.fileKeys must be a non-empty array of strings");
  }

  for (const key of fileKeys) {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error("Each item in ResourceProperties.fileKeys must be a non-empty string");
    }
  }
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  if (event.RequestType === "Delete") {
    return { Data: {} };
  }

  validateProperties(event.ResourceProperties);

  const { bucketName, fileKeys } = event.ResourceProperties as unknown as {
    bucketName: string;
    fileKeys: string[];
  };

  const resolved = await Promise.all(
    fileKeys.map(async (key: string) => {
      const fileData = await readFile(bucketName, key);
      return [key, fileData] as const;
    }),
  );

  const data: Record<string, any> = {};
  for (const [fileName, fileContent] of resolved) {
    for (const [contentKey, value] of Object.entries(fileContent)) {
      data[`${fileName}.${contentKey}`] = value;
    }
  }

  return { Data: data };
};
