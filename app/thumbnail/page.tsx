import type { Metadata } from "next";
import Mobile from "@/components/mobile/Mobile";

export const metadata: Metadata = { title: "Atelier", robots: { index: false } };

/* The share image (app/opengraph-image.png) is a capture of this page: the mobile alone, still, at 1200 × 630. */
export default function Thumbnail() {
  return (
    <div className="h-[630px] w-[1200px] bg-paper">
      <Mobile thumbnail />
    </div>
  );
}
