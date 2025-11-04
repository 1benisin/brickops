"use client";

import React, { useState } from "react";
import { decodeHTML } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

interface PackagingSlipItemsListProps {
  items: Doc<"bricklinkOrderItems">[];
}

const PartImage = ({ itemNo, colorId }: { itemNo: string; colorId: number }) => {
  const [currentImageUrl, setCurrentImageUrl] = useState<string>(
    `https://img.bricklink.com/ItemImage/PN/${colorId}/${itemNo}.png`,
  );
  const [hasError, setHasError] = useState(false);

  const handleImageError = () => {
    if (!hasError) {
      // Try fallback with color ID "0"
      const fallbackUrl = currentImageUrl.replace(/\/ItemImage\/PN\/\d+\//, "/ItemImage/PN/0/");
      setCurrentImageUrl(fallbackUrl);
      setHasError(true);
    }
  };

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentImageUrl}
        alt={`Part ${itemNo} color ${colorId}`}
        style={{ height: "100%", width: "100%", objectFit: "contain" }}
        onError={handleImageError}
      />
    </div>
  );
};

export function PackagingSlipItemsList({ items }: PackagingSlipItemsListProps) {
  if (!items || items.length === 0) return <div>No Order Items</div>;

  // Group items into rows of 3
  const itemRows: Doc<"bricklinkOrderItems">[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    itemRows.push(items.slice(i, i + 3));
  }

  return (
    <table>
      <tbody>
        {itemRows.map((row, i) => (
          <tr key={i}>
            {row.map((item) => (
              <td
                key={item._id}
                className="m-0.5 border border-gray-300"
                style={{ width: "calc(33.333% - 0.2em)" }}
              >
                <div style={{ display: "flex" }}>
                  <PartImage itemNo={item.itemNo} colorId={item.colorId} />
                  <div className="mx-2 w-3/4 flex-none text-sm">
                    <div className="flex justify-between">
                      <span>{item.colorName || `Color ${item.colorId}`}</span>
                      {/* Location not available in order items - would need to query inventory */}
                      <span></span>
                      <span>
                        <strong>{item.quantity}</strong> x
                      </span>
                    </div>
                    <hr style={{ margin: 0, padding: 0 }} />
                    <div>
                      <strong>{item.itemNo}x</strong> - {decodeHTML(item.itemName)}
                    </div>
                  </div>
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
