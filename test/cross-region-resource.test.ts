import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as CrossRegionResource from "../lib/cross-region-resource-stack";
import { CrossRegionReplicationReader } from "../lib/cross-region-reader";
import { CrossRegionReplicationWriter } from "../lib/cross-region-writer";

// example test. To run these tests, uncomment this file along with the
// example resource in lib/cross-region-resource-stack.ts
test("Bucket Created", () => {
  const app = new cdk.App();

  app.node.setContext("bucketsOnly", "true");

  // WHEN
  const stack = new CrossRegionResource.CrossRegionResourceStack(
    app,
    "MyTestStack",
    {
      env: { account: "123456789012", region: "us-east-1" },
      bucketName: "test-bucket",
    },
  );

  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: "test-bucket",
    VersioningConfiguration: { Status: "Enabled" },
  });

  template.hasOutput("CrossRegionReplicationBucketArn", {
    Export: { Name: "CrossRegionReplicationBucketArn-us-east-1" },
    Value: {
      "Fn::GetAtt": ["ReplicationBucket70D68737", "Arn"],
    },
    Description: "Cross-region replication bucket ARN",
  });
});

test("Replication Configuration Added", () => {
  const app = new cdk.App();

  // WHEN
  const stack = new CrossRegionResource.CrossRegionResourceStack(
    app,
    "MyTestStack",
    {
      env: { account: "123456789012", region: "us-east-1" },
      bucketName: "test-bucket",
    },
  );

  stack.addReplication("arn:aws:s3:::replica-bucket");

  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::IAM::Role", {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "s3.amazonaws.com",
          },
        },
      ],
    },
  });

  // Check that replication configuration is added
  template.resourceCountIs("AWS::IAM::Role", 2); // One for the stack, one for replication
  template.hasResourceProperties("AWS::S3::Bucket", {
    ReplicationConfiguration: {
      Rules: [
        {
          Destination: {
            Bucket: "arn:aws:s3:::replica-bucket",
          },
        },
      ],
    },
  });
});

test("CrossRegionReplicationReader Created", () => {
  const app = new cdk.App();

  // Create the source stack that exports the bucket
  new CrossRegionResource.CrossRegionResourceStack(
    app,
    "SourceStack",
    {
      env: { account: "123456789012", region: "us-east-1" },
      bucketName: "source-bucket",
    },
  );

  // Create a reader stack in a different region
  const readerStack = new cdk.Stack(app, "ReaderStack", {
    env: { account: "123456789012", region: "us-west-2" },
  });

  // WHEN
  new CrossRegionReplicationReader(readerStack, "Reader", {
    fileKeys: ["config.json", "data.json"],
  });

  // THEN
  const template = Template.fromStack(readerStack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Handler: "reader.handler",
    Runtime: "nodejs22.x",
    Timeout: 90,
  });

  template.hasResourceProperties("AWS::CloudFormation::CustomResource", {
    fileKeys: ["config.json", "data.json"],
  });
});

test("CrossRegionReplicationWriter Created", () => {
  const app = new cdk.App();

  // Create the source stack that exports the bucket
  new CrossRegionResource.CrossRegionResourceStack(
    app,
    "SourceStack",
    {
      env: { account: "123456789012", region: "us-east-1" },
      bucketName: "source-bucket",
    },
  );

  // Create a writer stack in a different region
  const writerStack = new cdk.Stack(app, "WriterStack", {
    env: { account: "123456789012", region: "us-west-2" },
  });

  // WHEN
  new CrossRegionReplicationWriter(writerStack, "Writer", {
    fileKey: "output.json",
    data: { key: "value", number: 42 },
  });

  // THEN
  const template = Template.fromStack(writerStack);

  template.hasResourceProperties("AWS::Lambda::Function", {
    Handler: "writer.handler",
    Runtime: "nodejs22.x",
  });

  template.hasResourceProperties("AWS::CloudFormation::CustomResource", {
    fileKey: "output.json",
    data: { key: "value", number: 42 },
  });
});
