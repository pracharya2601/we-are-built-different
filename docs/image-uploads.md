# Cloudflare R2 Image Uploads

## Contract

The control plane stores private, workspace-scoped images in Cloudflare R2
through the `IMAGE_UPLOADS` Worker binding. Browsers never receive R2
credentials, bucket endpoints, or public object URLs.

The upload flow is:

1. create a workspace-scoped upload intent;
2. send the exact image bytes to the authenticated content endpoint;
3. validate size, declared type, and image file signature;
4. write once to R2 with workspace metadata;
5. atomically complete the D1 record, audit the action, and queue downstream
   metadata delivery.

Every key is generated server-side:

```text
workspaces/{workspaceId}/images/{uploadId}.{extension}
```

R2 writes use `If-None-Match: *`, so an existing key cannot be overwritten.
The R2 upload version and ETag are persisted and included in the downstream
event.

## Infrastructure mapping

| Environment | Binding | Bucket |
| --- | --- | --- |
| Local | `IMAGE_UPLOADS` | local Wrangler simulation for `built-different-image-uploads-local` |
| Staging | `IMAGE_UPLOADS` | `built-different-image-uploads-staging` |
| Production | `IMAGE_UPLOADS` | not configured |

Local R2 data stays under Wrangler's project-local state and does not touch a
remote bucket. The staging bucket name is prepared in `wrangler.jsonc`, but the
remote bucket must exist before staging deployment.

No R2 access key is needed by the application. Cloudflare injects the binding
into the Worker. `IMAGE_UPLOAD_MAX_BYTES` is the only upload setting and
defaults to 10 MiB.

Keep the R2 bucket private. Do not enable an `r2.dev` public URL. If images later
need to be read by a browser or another service, expose a separately authorized
read route or service binding.

## Client workflow

### 1. Create an intent

```http
POST /api/v1/uploads/images
Content-Type: application/json

{
  "filename": "profile.png",
  "contentType": "image/png",
  "sizeBytes": 2048
}
```

The response contains the upload record and an authenticated Worker request:

```json
{
  "upload": {
    "id": "upl_...",
    "workspaceId": "wsp_...",
    "objectKey": "workspaces/wsp_.../images/upl_....png",
    "contentType": "image/png",
    "sizeBytes": 2048,
    "status": "pending"
  },
  "request": {
    "method": "PUT",
    "url": "https://app.example/api/v1/uploads/images/upl_.../content",
    "headers": {
      "content-type": "image/png"
    }
  }
}
```

### 2. Upload the bytes

```js
const response = await fetch(result.request.url, {
  method: result.request.method,
  headers: result.request.headers,
  body: file,
});

if (!response.ok) {
  throw new Error("Image upload failed");
}

const completed = await response.json();
```

The browser supplies `Content-Length` for the `File` body. The Worker requires
it to equal the intent size, reads no more than the configured maximum, checks
the actual byte count, and verifies the file signature for AVIF, GIF, JPEG,
PNG, or WebP. SVG is intentionally excluded.

The content endpoint completes the upload and queues metadata delivery. The
idempotent recovery endpoint remains available:

```http
POST /api/v1/uploads/images/{uploadId}/complete
```

It verifies an existing R2 object and repairs D1 completion if an R2 write
succeeded immediately before a database failure.

All upload routes require `product:use`, an active local workspace membership,
and any entitlement required by the account policy. The workspace comes from
the revalidated session; the client cannot select a workspace, bucket, or key.

## Downstream file-metadata delivery

Successful completion creates `image.upload.completed.v1`:

```json
{
  "id": "evt_...",
  "type": "image.upload.completed.v1",
  "schemaVersion": 1,
  "occurredAt": "2026-07-30T12:34:56.000Z",
  "data": {
    "eventId": "evt_...",
    "uploadId": "upl_...",
    "workspaceId": "wsp_...",
    "provider": "cloudflare_r2",
    "bucket": "built-different-image-uploads-staging",
    "objectKey": "workspaces/wsp_.../images/upl_....png",
    "etag": "opaque-r2-etag",
    "versionId": "opaque-r2-upload-version",
    "contentType": "image/png",
    "sizeBytes": 2048,
    "createdByUserId": "usr_...",
    "completedAt": "2026-07-30T12:34:56.000Z"
  }
}
```

Configure both:

- `FILE_METADATA_SERVICE_URL`: HTTPS receiver endpoint.
- `FILE_METADATA_SERVICE_TOKEN`: bearer token stored as a secret.

The scheduled Worker sends `Idempotency-Key: {eventId}` and
`X-Event-Type: image.upload.completed.v1`. The receiver must deduplicate on the
event ID and return 2xx only after durable acceptance. Delivery uses ten-second
timeouts, exponential backoff, bounded concurrency, and expired-lease recovery.
Upload completion never waits for the downstream service.

If both downstream settings are blank, events remain safely pending. Supplying
only one setting is a configuration error.

## Local verification

```bash
npm run db:migrate:local
npm run dev
```

Wrangler automatically provides a local R2 simulation from `wrangler.jsonc`.
If an older populated local D1 database stops at the pre-existing `0004`
workspace migration, preserve or back it up and repair that migration state
before applying the image migrations; the complete migration chain is also
safe to validate against a fresh isolated Wrangler state.
Exercise one authenticated upload and confirm:

1. the object key begins with the authenticated `workspaceId`;
2. `image_uploads.provider` is `r2`;
3. `image_uploads.status` becomes `completed`;
4. one `image.upload.completed.v1` event exists;
5. repeating the PUT cannot overwrite the object;
6. the event becomes `published` only after a downstream 2xx response.

Before staging deployment, create the isolated staging R2 bucket and run the
staging dry run. Production still requires a separately selected bucket and
explicit deployment approval.
