import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

const s3 = new S3Client({});

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  const { bucketName, fileKey, data } = event.ResourceProperties;

  if (event.RequestType === 'Delete') {
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: fileKey }));
    return;
  }

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    Body: JSON.stringify(data),
    ContentType: 'application/json'
  }));
};
