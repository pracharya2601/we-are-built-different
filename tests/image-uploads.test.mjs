import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectImageInR2,
  putImageInR2,
} from "../lib/uploads/r2-storage.ts";
import {
  buildImageObjectKey,
  parseImageUploadRequest,
  validateImageContent,
} from "../lib/uploads/validation.ts";

const maxImageBytes = 10 * 1024 * 1024;

test("image upload keys are server-generated and workspace scoped", () => {
  const input = parseImageUploadRequest(
    {
      filename: "../../private portrait.png",
      contentType: "image/png",
      sizeBytes: 2048,
    },
    maxImageBytes,
  );
  assert.deepEqual(input, {
    filename: "../../private portrait.png",
    contentType: "image/png",
    sizeBytes: 2048,
  });
  assert.equal(
    buildImageObjectKey(
      "wsp_0123456789abcdef0123456789abcdef",
      "upl_fedcba9876543210fedcba9876543210",
      input.contentType,
    ),
    "workspaces/wsp_0123456789abcdef0123456789abcdef/images/upl_fedcba9876543210fedcba9876543210.png",
  );
});

test("image validation rejects unsupported, oversized, and disguised files", () => {
  assert.throws(
    () =>
      parseImageUploadRequest(
        {
          filename: "avatar.svg",
          contentType: "image/svg+xml",
          sizeBytes: 100,
        },
        maxImageBytes,
      ),
    /contentType must be one of/u,
  );
  assert.throws(
    () =>
      parseImageUploadRequest(
        {
          filename: "avatar.png",
          contentType: "image/png",
          sizeBytes: maxImageBytes + 1,
        },
        maxImageBytes,
      ),
    /sizeBytes must be a positive integer/u,
  );
  assert.throws(
    () =>
      validateImageContent(
        "image/png",
        new TextEncoder().encode("<script>").buffer,
      ),
    /do not match the declared image content type/u,
  );
});

test("image signature validation accepts the supported formats", () => {
  validateImageContent(
    "image/png",
    Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]).buffer,
  );
  validateImageContent(
    "image/jpeg",
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]).buffer,
  );
  validateImageContent(
    "image/gif",
    new TextEncoder().encode("GIF89a").buffer,
  );
  validateImageContent(
    "image/webp",
    new TextEncoder().encode("RIFF0000WEBP").buffer,
  );
  validateImageContent(
    "image/avif",
    new TextEncoder().encode("\0\0\0\u0018ftypavif").buffer,
  );
});

test("R2 writes are conditional, tenant tagged, and return object metadata", async () => {
  let putOptions;
  const object = r2Object();
  const bucket = {
    head: async () => null,
    put: async (_key, _body, options) => {
      putOptions = options;
      return object;
    },
  };
  const metadata = await putImageInR2(bucket, {
    objectKey: object.key,
    body: Uint8Array.from([1, 2, 3]).buffer,
    contentType: "image/png",
    uploadId: "upl_456",
    workspaceId: "wsp_123",
  });

  assert.equal(putOptions.onlyIf.get("if-none-match"), "*");
  assert.deepEqual(putOptions.httpMetadata, { contentType: "image/png" });
  assert.deepEqual(putOptions.customMetadata, {
    uploadId: "upl_456",
    workspaceId: "wsp_123",
  });
  assert.deepEqual(metadata, {
    etag: "opaque-etag",
    versionId: "r2-version-001",
    contentType: "image/png",
    sizeBytes: 3,
    uploadId: "upl_456",
    workspaceId: "wsp_123",
  });
});

test("R2 retries reuse an existing object without overwriting it", async () => {
  let writes = 0;
  const bucket = {
    head: async () => r2Object(),
    put: async () => {
      writes += 1;
      return r2Object();
    },
  };
  const metadata = await putImageInR2(bucket, {
    objectKey: "workspaces/wsp_123/images/upl_456.png",
    body: Uint8Array.from([1, 2, 3]).buffer,
    contentType: "image/png",
    uploadId: "upl_456",
    workspaceId: "wsp_123",
  });
  assert.equal(writes, 0);
  assert.equal(metadata.versionId, "r2-version-001");
});

test("R2 verification fails closed when the object is missing", async () => {
  await assert.rejects(
    inspectImageInR2({ head: async () => null }, "missing.png"),
    /not found in Cloudflare R2/u,
  );
});

test("routes preserve workspace isolation, R2 checks, and delivery idempotency", async () => {
  const [contentRoute, completionRoute, repository, delivery] =
    await Promise.all([
      readFile(
        new URL(
          "../app/api/v1/uploads/images/[uploadId]/content/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/v1/uploads/images/[uploadId]/complete/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../lib/uploads/repository.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../lib/uploads/delivery.ts", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(contentRoute, /auth\.workspaceId/u);
  assert.match(contentRoute, /request\.arrayBuffer/u);
  assert.match(contentRoute, /validateImageContent/u);
  assert.match(contentRoute, /putImageInR2/u);
  assert.match(completionRoute, /inspectImageInR2/u);
  assert.match(repository, /provider: "cloudflare_r2"/u);
  assert.match(repository, /workspaceId: input\.workspaceId/u);
  assert.match(repository, /versionId: input\.metadata\.versionId/u);
  assert.match(repository, /auditMutation/u);
  assert.match(delivery, /"idempotency-key": event\.id/u);
  assert.match(delivery, /releaseExpiredOutboxLeases/u);
  assert.match(delivery, /markOutboxPublished/u);
  assert.match(delivery, /markOutboxFailed/u);
});

function r2Object() {
  return {
    key: "workspaces/wsp_123/images/upl_456.png",
    version: "r2-version-001",
    size: 3,
    etag: "opaque-etag",
    httpEtag: "\"opaque-etag\"",
    uploaded: new Date("2026-07-30T12:34:56.000Z"),
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      uploadId: "upl_456",
      workspaceId: "wsp_123",
    },
    range: undefined,
    checksums: {},
    writeHttpMetadata() {},
    storageClass: "Standard",
  };
}
