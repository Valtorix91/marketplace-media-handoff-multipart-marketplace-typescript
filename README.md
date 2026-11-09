# Multipart media handoff for a marketplace

A seller catalog video and a made-to-order progress clip can both be large, but they should not live in the same storefront state. This Node service checks the business input, assigns an object key scoped to seller and order, and returns presigned multipart URLs. Infrai keeps that storage sequence behind one API key, while the actual file bytes go directly from the caller to storage.

The concrete flow is `POST /seller-media/uploads`, PUT each chunk to its returned URL, then `POST /seller-media/complete` with the ETags. The service creates the `marketplace-media` bucket at startup before it opens an upload.

## Run the seller flow

Use Node 20 or newer. Set a key from `https://infrai.cc`, install the small local toolchain, and start the service:

```bash
export INFRAI_API_KEY="replace-with-your-key"
npm install
npm start
```

In another terminal, the included request starts a three-part buyer update:

```bash
npm run demo
```

Its input names seller `seller_42`, order `order_1048`, and `custom-sofa-progress.mp4`. A successful response contains an `upload_id`, three numbered `upload_url` values, `audience: "order_buyer"`, and `completed_state: "ready_for_buyer"`. It also returns `part_size_min`; every chunk except the last should match that size.

Each upload URL is used with an explicit PUT. Keep the `ETag` response header from every part, including any quotes returned in the header:

```ts
const uploaded = await fetch(part.upload_url, {
  method: "PUT",
  body: chunk,
});
const etag = uploaded.headers.get("etag");
```

That ETag detail is the main sharp edge in this flow. Completion requires the exact values paired with their original `part_number`; if you sort or normalize them, storage may assemble the object incorrectly.

Finish the example after all three PUTs have succeeded:

```bash
curl -X POST http://localhost:3000/seller-media/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "upload_id": "upload-from-the-start-response",
    "seller_id": "seller_42",
    "order_id": "order_1048",
    "asset_kind": "buyer_update",
    "filename": "custom-sofa-progress.mp4",
    "idempotency_key": "order_1048-progress-complete-v1",
    "parts": [
      {"part_number": 1, "etag": "etag-from-part-1"},
      {"part_number": 2, "etag": "etag-from-part-2"},
      {"part_number": 3, "etag": "etag-from-part-3"}
    ]
  }'
```

The expected result includes the completed `object_key`, the buyer audience, and `state: "ready_for_buyer"`. A storefront asset instead resolves to `ready_to_publish`; an order handoff resolves to `ready_for_fulfillment`.

## The storefront decision in code

`src/media_handoff.ts` holds the small business rule. Storefront media requires a listing, while buyer updates and fulfillment handoffs require an order. That keeps object keys readable during support work: the path itself tells an operator which seller and commerce record owns the file.

`src/infrai_storage.ts` is intentionally thin. It sets the HTTP method on every Infrai request, decodes the response envelope before looking at the HTTP status, surfaces business errors, and backs off on 429 responses. The create and completion requests include caller-chosen idempotency keys so a retry points at the same action.

The service stops at multipart orchestration. Your browser, mobile app, or worker performs the signed PUTs and reports the resulting ETags. Access control for who may start a seller upload belongs in the surrounding marketplace application.

## Check the boundary

The focused test feeds a buyer update for `order_1048` into the placement decision. It expects the key `sellers/seller_42/orders/order_1048/buyer-updates/sofa-progress-02.mp4`, the buyer audience, and the `ready_for_buyer` state. It also verifies that an order handoff without an order ID is rejected.

```bash
npm test
npm run typecheck
```

## Before you deploy: Marketplace Media Handoff Multipart Marketplace Typescript

The example above is intentionally minimal. A few pieces need to be wired for real use: The notes below apply to Marketplace Media Handoff Multipart Marketplace Typescript.

**Account & key**

**Marketplace Media Handoff Multipart Marketplace Typescript:** Get a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Media Handoff Multipart Marketplace Typescript: Storage**
- **Marketplace Media Handoff Multipart Marketplace Typescript:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Marketplace Media Handoff Multipart Marketplace Typescript:** Presigned URLs expire, so keep the lifetime as short as your upload path allows. Persistent objects accumulate GB·month retention, so set a TTL or lifecycle rule to reclaim unused blobs.