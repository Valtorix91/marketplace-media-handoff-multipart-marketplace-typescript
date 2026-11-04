import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai_storage.js";
import { placeMarketplaceMedia } from "./media_handoff.js";

const bucket = process.env.MEDIA_BUCKET ?? "marketplace-media";
const port = Number(process.env.PORT ?? 3000);

const startUploadBody = z.object({
  seller_id: z.string().min(1),
  asset_kind: z.enum(["storefront", "buyer_update", "order_handoff"]),
  filename: z.string().min(1),
  content_type: z.string().min(1),
  part_count: z.number().int().min(1),
  idempotency_key: z.string().min(8),
  listing_id: z.string().min(1).optional(),
  order_id: z.string().min(1).optional(),
});

const finishUploadBody = z.object({
  upload_id: z.string().min(1),
  seller_id: z.string().min(1),
  asset_kind: z.enum(["storefront", "buyer_update", "order_handoff"]),
  filename: z.string().min(1),
  listing_id: z.string().min(1).optional(),
  order_id: z.string().min(1).optional(),
  idempotency_key: z.string().min(8),
  parts: z.array(z.object({ part_number: z.number().int().positive(), etag: z.string().min(1) })).min(1),
});

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const bucketReady = infrai.storage.bucket.create({ name: bucket });

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/seller-media/uploads") {
      const input = startUploadBody.parse(await readJson(request));
      const placement = placeMarketplaceMedia({
        sellerId: input.seller_id,
        assetKind: input.asset_kind,
        filename: input.filename,
        listingId: input.listing_id,
        orderId: input.order_id,
      });
      await bucketReady;
      const created = await infrai.storage.multipart.create(bucket, {
        key: placement.objectKey,
        content_type: input.content_type,
        idempotency_key: input.idempotency_key,
      });
      if (input.part_count > created.part_count_max) {
        return send(response, 400, { error: "part_count exceeds the upload limit" });
      }
      const parts = await Promise.all(
        Array.from({ length: input.part_count }, async (_, index) => ({
          part_number: index + 1,
          upload_url: (await infrai.storage.multipart.presign_part(created.upload_id, index + 1)).url,
        })),
      );
      return send(response, 201, {
        upload_id: created.upload_id,
        object_key: placement.objectKey,
        audience: placement.audience,
        completed_state: placement.completedState,
        part_size_min: created.part_size_min,
        parts,
      });
    }

    if (request.method === "POST" && request.url === "/seller-media/complete") {
      const input = finishUploadBody.parse(await readJson(request));
      const placement = placeMarketplaceMedia({
        sellerId: input.seller_id,
        assetKind: input.asset_kind,
        filename: input.filename,
        listingId: input.listing_id,
        orderId: input.order_id,
      });
      const object = await infrai.storage.multipart.complete(input.upload_id, {
        parts: input.parts.map((part) => ({
          part_number: part.part_number!,
          etag: part.etag!,
        })),
        idempotency_key: input.idempotency_key,
      });
      return send(response, 200, {
        object_key: object.key,
        size_bytes: object.size_bytes,
        audience: placement.audience,
        state: placement.completedState,
      });
    }

    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, message: error.message });
    }
    return send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

server.listen(port, () => {
  console.log(`Marketplace media service listening on http://localhost:${port}`);
});
