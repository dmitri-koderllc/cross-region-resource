#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CrossRegionResourceStack } from '../lib/cross-region-resource-stack';

const app = new cdk.App();
// amazonq-ignore-next-line
const account = '039781381332';

const bucket1Name = 'replication-bucket-us-east-1-039781381332';
const bucket2Name = 'replication-bucket-us-east-2-039781381332';

const bucketsOnly = app.node.tryGetContext('bucketsOnly') === 'true';

const usEast1Stack = new CrossRegionResourceStack(app, 'BucketStackUsEast1', {
  env: { account, region: 'us-east-1' },
  bucketName: bucket1Name
});

const usEast2Stack = new CrossRegionResourceStack(app, 'BucketStackUsEast2', {
  env: { account, region: 'us-east-2' },
  bucketName: bucket2Name
});

if (!bucketsOnly) {
  usEast1Stack.addReplication(`arn:aws:s3:::${bucket2Name}`);
  usEast2Stack.addReplication(`arn:aws:s3:::${bucket1Name}`);
}
