const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { config } = require("../config/env");

function assertSafeStorageKey(key) {
  if (!/^medical-reports\/[0-9]{4}\/[0-9]{2}\/[a-f0-9-]+\.(pdf|jpg|png)$/.test(String(key || ""))) {
    throw new Error("Invalid private storage key");
  }
}

function createLocalStorage({ rootDir = config.storage.localPath } = {}) {
  const absoluteRoot = path.resolve(rootDir);
  function resolveKey(key) {
    assertSafeStorageKey(key);
    const target = path.resolve(absoluteRoot, ...key.split("/"));
    if (!target.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error("Invalid private storage key");
    return target;
  }
  return {
    provider: "local",
    async putObject({ key, body }) {
      const target = resolveKey(key);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, body, { flag: "wx", mode: 0o600 });
    },
    async getObject({ key }) {
      const target = resolveKey(key);
      await fsp.access(target, fs.constants.R_OK);
      return fs.createReadStream(target);
    },
    async deleteObject({ key }) {
      const target = resolveKey(key);
      try {
        await fsp.unlink(target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  };
}

function createS3Storage(storageConfig = config.storage) {
  const client = new S3Client({
    endpoint: storageConfig.endpoint,
    region: storageConfig.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey
    }
  });
  const bucket = storageConfig.bucket;
  return {
    provider: "s3",
    async putObject({ key, body, contentType }) {
      assertSafeStorageKey(key);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        IfNoneMatch: "*",
        ServerSideEncryption: "AES256"
      }));
    },
    async getObject({ key }) {
      assertSafeStorageKey(key);
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error("Private object was not returned by storage");
      return result.Body;
    },
    async deleteObject({ key }) {
      assertSafeStorageKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  };
}

let testStorage;
let configuredStorage;
function getMedicalFileStorage() {
  if (testStorage) return testStorage;
  if (!configuredStorage) configuredStorage = config.storage.provider === "s3" ? createS3Storage() : createLocalStorage();
  return configuredStorage;
}

function setMedicalFileStorageForTests(storage) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test storage injection is disabled outside tests");
  testStorage = storage || undefined;
}

module.exports = {
  assertSafeStorageKey,
  createLocalStorage,
  createS3Storage,
  getMedicalFileStorage,
  setMedicalFileStorageForTests
};
