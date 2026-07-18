import type { Metadata } from "next";

import { ChangeRoom } from "@/components/product/change-room";

export const metadata: Metadata = {
  title: "Control Room",
};

export default function OverviewPage() {
  return <ChangeRoom />;
}
