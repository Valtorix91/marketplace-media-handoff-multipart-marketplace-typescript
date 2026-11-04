import assert from "node:assert/strict";
import test from "node:test";
import { placeMarketplaceMedia } from "../src/media_handoff.js";

test("a buyer update is scoped to its seller and order", () => {
  const placement = placeMarketplaceMedia({
    sellerId: "seller_42",
    orderId: "order_1048",
    assetKind: "buyer_update",
    filename: "Sofa Progress 02.MP4",
  });

  assert.deepEqual(placement, {
    objectKey: "sellers/seller_42/orders/order_1048/buyer-updates/sofa-progress-02.mp4",
    audience: "order_buyer",
    completedState: "ready_for_buyer",
  });
});

test("order handoff media cannot lose its order boundary", () => {
  assert.throws(
    () => placeMarketplaceMedia({ sellerId: "seller_42", assetKind: "order_handoff", filename: "label.pdf" }),
    /needs an orderId/,
  );
});
