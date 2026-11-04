export type AssetKind = "storefront" | "buyer_update" | "order_handoff";

export type MediaPlacement = {
  objectKey: string;
  audience: "storefront_shoppers" | "order_buyer" | "fulfillment_team";
  completedState: "ready_to_publish" | "ready_for_buyer" | "ready_for_fulfillment";
};

type PlacementInput = {
  sellerId: string;
  assetKind: AssetKind;
  filename: string;
  listingId?: string;
  orderId?: string;
};

function cleanFilename(filename: string): string {
  return filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function placeMarketplaceMedia(input: PlacementInput): MediaPlacement {
  const filename = cleanFilename(input.filename);
  if (input.assetKind === "storefront") {
    if (!input.listingId) throw new Error("Storefront media needs a listingId");
    return {
      objectKey: `sellers/${input.sellerId}/listings/${input.listingId}/${filename}`,
      audience: "storefront_shoppers",
      completedState: "ready_to_publish",
    };
  }

  if (!input.orderId) throw new Error("Order media needs an orderId");
  const folder = input.assetKind === "buyer_update" ? "buyer-updates" : "handoff";
  return {
    objectKey: `sellers/${input.sellerId}/orders/${input.orderId}/${folder}/${filename}`,
    audience: input.assetKind === "buyer_update" ? "order_buyer" : "fulfillment_team",
    completedState: input.assetKind === "buyer_update" ? "ready_for_buyer" : "ready_for_fulfillment",
  };
}
