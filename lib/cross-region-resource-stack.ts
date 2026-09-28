import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface CrossRegionResourceStackProps extends cdk.StackProps {
  bucketName: string;
}

export class CrossRegionResourceStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CrossRegionResourceStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'ReplicationBucket', {
      bucketName: props.bucketName,
      versioned: true,
      // amazonq-ignore-next-line
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      // amazonq-ignore-next-line
      key: `CrossRegionReplicationBucketArn`,
      exportName: `CrossRegionReplicationBucketArn-${this.region}`,
      value: this.bucket.bucketArn,
      description: 'Cross-region replication bucket ARN'
    });
  }

  public addReplication(replicaBucketArn: string) {
    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com')
    });

    replicationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetReplicationConfiguration', 's3:ListBucket'],
      resources: [this.bucket.bucketArn]
    }));

    replicationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObjectVersionForReplication', 's3:GetObjectVersionAcl'],
      resources: [`${this.bucket.bucketArn}/*`]
    }));

    replicationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ReplicateObject', 's3:ReplicateDelete'],
      resources: [`${replicaBucketArn}/*`]
    }));

    const cfnBucket = this.bucket.node.defaultChild;
    if (!(cfnBucket instanceof s3.CfnBucket)) {
      throw new Error('Bucket default child is not a CfnBucket');
    }
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules: [{
        id: 'replication-rule',
        status: 'Enabled',
        priority: 1,
        filter: {},
        destination: {
          bucket: replicaBucketArn,
          replicationTime: { status: 'Enabled', time: { minutes: 15 } },
          metrics: { status: 'Enabled', eventThreshold: { minutes: 15 } }
        },
        deleteMarkerReplication: { status: 'Enabled' }
      }]
    };
  }
}
