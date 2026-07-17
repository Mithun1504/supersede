import type { Metadata } from "next";

import { ChangeRoom } from "@/components/product/change-room";

export const metadata: Metadata = {
  title: "Change Room",
};

export default function OverviewPage() {
  return <ChangeRoom />;
}
