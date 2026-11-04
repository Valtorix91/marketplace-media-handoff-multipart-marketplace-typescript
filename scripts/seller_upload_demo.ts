export {};

const serviceUrl = process.env.SERVICE_URL ?? "http://localhost:3000";

const response = await fetch(`${serviceUrl}/seller-media/uploads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    seller_id: "seller_42",
    order_id: "order_1048",
    asset_kind: "buyer_update",
    filename: "custom-sofa-progress.mp4",
    content_type: "video/mp4",
    part_count: 3,
    idempotency_key: "order_1048-progress-v1",
  }),
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
