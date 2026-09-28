import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";
import { Bucket } from "aws-cdk-lib/aws-s3";

export interface CrossRegionReplicationReaderProps {
  readonly fileKeys: string[];
}

export class CrossRegionReplicationReader extends Construct {
  private readonly resource: cdk.CustomResource;

  constructor(
    scope: Construct,
    id: string,
    props: CrossRegionReplicationReaderProps,
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
      handler: "reader.handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(90),
    });

    bucket.grantRead(fn);

    const provider = new cr.Provider(this, "Provider", { onEventHandler: fn });

    this.resource = new cdk.CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
      properties: { bucketName, fileKeys: props.fileKeys },
    });
  }

  /**
   * Get a file token for a reader result.
   * During synth: returns a token object that can be passed around.
   * During deployment: resolves to the object data for the file.
   *
   * @param fileKey File name to retrieve
   * @param key key value in the file to retrieve
   * @returns A file token that can return field tokens as string
   */
  public getValue(fileKey: string, key: string): string {
    return this.resource.getAttString(`${fileKey}.${key}`);
  }
}
