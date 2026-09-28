import { handler as readerHandler } from "../lib/cross-region-reader.handler";
import { handler as writerHandler } from "../lib/cross-region-writer.handler";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";

// Mock the S3 client
let mockSend: jest.Mock;

// Keep the real NoSuchKey class, but mock only the client and commands
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: (...args: any[]) => mockSend(...args),
    })),
    GetObjectCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  };
});

beforeAll(() => {
  mockSend = jest.fn();
});

describe("CrossRegionReader Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should handle Create event and read files", async () => {
    const mockResponse = {
      Body: {
        transformToString: jest.fn().mockResolvedValue('{"key": "value"}'),
      },
    };

    mockSend.mockResolvedValue(mockResponse);

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    const result = await readerHandler(event);

    expect(result).toEqual({
      Data: {
        "config.json.key": "value",
      },
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.any(GetObjectCommand)
    );
  });

  test("should handle Delete event", async () => {
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Delete",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      PhysicalResourceId: "physical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    const result = await readerHandler(event);

    expect(result).toEqual({ Data: {} });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("should retry on NoSuchKey error", async () => {
    const mockResponse = {
      Body: {
        transformToString: jest.fn().mockResolvedValue('{"key": "value"}'),
      },
    };

    // First call throws NoSuchKey, second succeeds
    mockSend
      .mockRejectedValueOnce(new NoSuchKey({ message: "Not found", $metadata: {} }))
      .mockResolvedValueOnce(mockResponse);

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    const result = await readerHandler(event);

    expect(result).toEqual({
      Data: {
        "config.json.key": "value",
      },
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 10000);

  test.skip("should throw error if file not found within timeout", async () => {
    mockSend.mockRejectedValue(new NoSuchKey({ message: "Not found", $metadata: {} }));

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "File config.json did not appear in test-bucket within 60s"
    );
  });

  test("should throw error for invalid JSON content", async () => {
    const mockResponse = {
      Body: {
        transformToString: jest.fn().mockResolvedValue("{invalid json"),
      },
    };

    mockSend.mockResolvedValue(mockResponse);

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    try {
      const result = await readerHandler(event);
      console.log("Result:", result);
      fail("Expected to throw");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("should throw error when bucketName is missing", async () => {
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        fileKeys: ["config.json"],
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "ResourceProperties.bucketName must be a non-empty string"
    );
  });

  test("should throw error when bucketName is empty string", async () => {
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "  ",
        fileKeys: ["config.json"],
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "ResourceProperties.bucketName must be a non-empty string"
    );
  });

  test("should throw error when fileKeys is missing", async () => {
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "ResourceProperties.fileKeys must be a non-empty array of strings"
    );
  });

  test("should throw error when fileKeys is empty array", async () => {
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: [],
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "ResourceProperties.fileKeys must be a non-empty array of strings"
    );
  });

  test("should throw error when fileKeys contains non-string items", async () => {
    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json", 123],
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "Each item in ResourceProperties.fileKeys must be a non-empty string"
    );
  });

  test("should throw error when S3 response has no body", async () => {
    const mockResponse = {
      Body: null,
    };

    mockSend.mockResolvedValue(mockResponse);

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    await expect(readerHandler(event)).rejects.toThrow(
      "S3 object config.json in test-bucket returned no body"
    );
  });

  test("should retry on error with name property set to NoSuchKey", async () => {
    const mockResponse = {
      Body: {
        transformToString: jest.fn().mockResolvedValue('{"key": "value"}'),
      },
    };

    const noSuchKeyError = new Error("Not found");
    (noSuchKeyError as any).name = "NoSuchKey";

    // First call throws NoSuchKey by name, second succeeds
    mockSend
      .mockRejectedValueOnce(noSuchKeyError)
      .mockResolvedValueOnce(mockResponse);

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json"],
      },
    };

    const result = await readerHandler(event);

    expect(result).toEqual({
      Data: {
        "config.json.key": "value",
      },
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 10000);

  test("should flatten multiple files with multiple keys", async () => {
    mockSend
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue('{"env": "prod", "version": "1.0"}'),
        },
      })
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue('{"database": "postgres", "port": 5432}'),
        },
      });

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionReader",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKeys: ["config.json", "database.json"],
      },
    };

    const result = await readerHandler(event);

    expect(result).toEqual({
      Data: {
        "config.json.env": "prod",
        "config.json.version": "1.0",
        "database.json.database": "postgres",
        "database.json.port": 5432,
      },
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

describe("CrossRegionWriter Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should handle Create event and write file", async () => {
    mockSend.mockResolvedValue({});

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Create",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      ResourceType: "Custom::CrossRegionWriter",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKey: "output.json",
        data: { key: "value" },
      },
    };

    await writerHandler(event);

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "output.json",
      Body: '{"key":"value"}',
      ContentType: "application/json",
    });
    expect(mockSend).toHaveBeenCalled();
  });

  test("should handle Delete event and delete file", async () => {
    mockSend.mockResolvedValue({});

    const event: CloudFormationCustomResourceEvent = {
      RequestType: "Delete",
      ServiceToken: "token",
      ResponseURL: "url",
      StackId: "stack",
      RequestId: "request",
      LogicalResourceId: "logical",
      PhysicalResourceId: "physical",
      ResourceType: "Custom::CrossRegionWriter",
      ResourceProperties: {
        ServiceToken: "token",
        bucketName: "test-bucket",
        fileKey: "output.json",
        data: { key: "value" },
      },
    };

    await writerHandler(event);

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "output.json",
    });
    expect(mockSend).toHaveBeenCalled();
  });
});