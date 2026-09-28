import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";
import { Bucket } from "aws-cdk-lib/aws-s3";

export interface CrossRegionReplicationWriterProps {
  readonly fileKey: string;
  readonly data: { [key: string]: any };
}

export class CrossRegionReplicationWriter extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: CrossRegionReplicationWriterProps,
  ) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const bucketArn = cdk.Fn.importValue(
      `CrossRegionReplicationBucketArn-${stack.region}`,
    );
    const bucket = Bucket.fromBucketArn(this, "CrossRegionBucket", bucketArn);
    const bucketName = bucket.bucketName;

    const fn = new lambda.Function(this, "Handler", {
      code: lambda.Code.fromAsset(path.join(__dirname, "handlers")),
      handler: "writer.handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["s3:PutObject", "s3:DeleteObject"],
          resources: [`${bucketArn}/*`],
        }),
      ],
    });

    bucket.grantWrite(fn);
    bucket.grantDelete(fn);
    
    const provider = new cr.Provider(this, "Provider", { onEventHandler: fn });

    new cdk.CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
      serviceTimeout: cdk.Duration.seconds(60),
      properties: {
        bucketName,
        fileKey: props.fileKey,
        data: props.data,
      },
    });
  }
}
