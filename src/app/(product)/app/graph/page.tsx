import type { Metadata } from "next";

import { GraphBriefing } from "@/components/product/graph-briefing";

export const metadata: Metadata = {
  title: "Graph Briefing",
};

export default function GraphPage() {
  return <GraphBriefing />;
}
