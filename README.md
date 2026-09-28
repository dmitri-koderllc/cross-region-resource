# 🌍 AWS Multi-Region S3 Sync Constructs

An AWS CDK project that establishes cross-region S3 bucket synchronization along with reusable reader and writer constructs for seamless cross-region resource sharing.

## 🤔 Why
- Is it better than AWS built-in cross region? No.
- Why then? Because I was curious how to get it to work.

---

## 📦 Installation

> **Not published to npm or Maven (yet).** This package isn't on any registry — use it by checking out the repo locally. If there's demand, I'll publish it.

```bash
git clone https://github.com/dmitri-koderllc/cross-region-resource.git
cd cross-region-resource
npm install
npm run build
```

Then reference it from your CDK app as a local dependency (e.g. `npm install /path/to/cross-region-resource` or a local `file:` path in your `package.json`).

> **Version alignment:** When installing locally, make sure your consuming project uses the same `aws-cdk-lib` and `constructs` versions this package is built against (see below). `aws-cdk-lib` ships bundled dependencies, and a version mismatch can crash npm's install with `Cannot read properties of null (reading 'resolve')`.

### Java (local Maven repository)

The Java artifact isn't on Maven Central either. After building, generate the jsii Java package and install it into your local Maven repository:

```bash
npm run package    # runs jsii-pacmak, emits the Maven artifact under dist/java
mvn install:install-file \
  -Dfile=dist/java/net/koderllc/cross-region-resource/0.1.1/cross-region-resource-0.1.1.jar \
  -DpomFile=dist/java/net/koderllc/cross-region-resource/0.1.1/cross-region-resource-0.1.1.pom
```

Then depend on it from your own project:

```xml
<dependency>
  <groupId>net.koderllc</groupId>
  <artifactId>cross-region-resource</artifactId>
  <version>0.1.1</version>
</dependency>
```

**Prerequisites:**
- AWS CDK v2 — `aws-cdk-lib` `2.271.0` and `constructs` `10.8.1`, pinned to exact versions as required by jsii
- Buckets must be versioned for S3 replication — the provided `CrossRegionResourceStack` enables this automatically.

---

## 🚀 Infrastructure Setup (2-Pass Deployment)

S3 cross-region replication requires the destination buckets to exist before replication rules can be applied, so setting the buckets up **requires two sequential passes**.

### Pass 1: Provision the S3 Buckets
Create a stack with 2 or more `CrossRegionResourceStack` constructs.

```typescript
const account = process.env.CDK_DEFAULT_ACCOUNT;
// Set `-c bucketsOnly=true` for the first pass to provision buckets only.
// Defaults to false, so all later runs need no flag and apply replication.
const bucketsOnly = app.node.tryGetContext('bucketsOnly') === 'true';
const bucket1Name = 'us-east-1-bucket';
const bucket2Name = 'us-west-2-bucket';

const usEast1Stack = new CrossRegionResourceStack(app, 'BucketStackUsEast1', {
  env: { account, region: 'us-east-1' },
  bucketName: bucket1Name
});
const usWest2Stack = new CrossRegionResourceStack(app, 'BucketStackUsWest2', {
  env: { account, region: 'us-west-2' },
  bucketName: bucket2Name
});

if (!bucketsOnly) {
  usEast1Stack.addReplication(`arn:aws:s3:::${bucket2Name}`);
  usWest2Stack.addReplication(`arn:aws:s3:::${bucket1Name}`);
}
```

Run the deployment with `-c bucketsOnly=true`. This creates the underlying storage infrastructure across your target regions.

```bash
cdk deploy YourStack -c bucketsOnly=true
```

### Pass 2: Enable Cross-Region Synchronization
Run the deployment again **without** the flag — `bucketsOnly` defaults to `false`. This applies the replication configurations, IAM roles, and sync rules across the established buckets.

```bash
cdk deploy YourStack
```

---

## 🛠️ Developer Usage

Once the core synchronization infrastructure is deployed, import and use the pre-configured `CrossRegionReplicationWriter` and `CrossRegionReplicationReader` constructs in your consumer CDK stacks. Each construct imports the bucket exported in the region of the stack it's used in, so you never pass a bucket name yourself.

### 1. Writing Resources (Source Region)
The Writer construct puts your data or resource identifiers into the synchronized bucket in the current stack's region. S3 then replicates it outward.

```typescript
import { CrossRegionReplicationWriter } from 'cross-region-resource';

new CrossRegionReplicationWriter(this, 'MyResourceWriter', {
  fileKey: 'sync-file-name',
  data: {
    'arn1': 'some-arn',
    'arn2': 'some-other-arn'
  }
});
```

`CrossRegionResourceStack` exports the bucket name, so there's no need to provide it.

### 2. Reading Resources (Destination Region)
After S3 replication copies the file into the destination region's bucket, the Reader construct reads that replicated data natively within the region.

```typescript
import { CrossRegionReplicationReader } from 'cross-region-resource';

const reader = new CrossRegionReplicationReader(this, 'MyResourceReader', {
  fileKeys: ['sync-file-name', 'other-sync-file-name']
});
const arn1 = reader.getValue('sync-file-name', 'arn1');
```

When you pass multiple config names in `fileKeys`, the reader aggregates them into a single result set. Each file can be produced by a different writer, so one reader can gather data from many independent sources in one place:

```typescript
const reader = new CrossRegionReplicationReader(this, 'MyResourceReader', {
  fileKeys: ['from-service-a', 'from-service-b']
});
const arnA = reader.getValue('from-service-a', 'arn1');
const arnB = reader.getValue('from-service-b', 'arn1');
```

> **Note:** `getValue` returns a CloudFormation token that resolves to the actual value at deploy time. Pass it to other constructs directly — it can't be inspected or manipulated as a plain string during synth.

---

## 🔄 How It Works Under the Hood

1. **Write**: Your application uses the `CrossRegionReplicationWriter` construct to write resource identifiers to a file in the source region's S3 bucket.
2. **Replicate**: AWS S3 Cross-Region Replication automatically synchronizes the object to the destination bucket.
3. **Read**: The `CrossRegionReplicationReader` construct reads the file locally from the destination region's bucket, minimizing cross-region latency.

---

## 🌐 Cross-Language Support

Because the constructs are built with [jsii](https://aws.github.io/jsii/), the two sides of a sync don't have to share a language. The data flows through S3 as plain JSON, so the writer and reader are fully decoupled — a `CrossRegionReplicationWriter` deployed from a TypeScript/JavaScript stack can be consumed by a `CrossRegionReplicationReader` in a Java stack (or vice versa). Any jsii-supported language works on either end.

---

## ⚠️ Limitations

- **Replication is not instant.** This project enables S3 Replication Time Control (RTC), which is designed to replicate 99.99% of objects within 15 minutes and is [backed by an SLA](https://aws.amazon.com/s3/sla-rtc/) committing to 99.9% of objects within 15 minutes per billing month. A reader in the destination region won't see a freshly written file until replication completes, so don't rely on read-after-write across regions.
- **Response payload cap.** The reader returns its results through a CloudFormation custom resource, whose [response body is capped at 4096 bytes](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-limits.html). Keep the combined size of the values you read back within that limit; large payloads will fail the deployment.

---

## 📄 License

Licensed under the [GNU General Public License v3.0](LICENSE).
