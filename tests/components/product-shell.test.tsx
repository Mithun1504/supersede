import type React from "react";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { ProductShell } from "@/components/product/product-shell";
import { EmptyState } from "@/components/product/status";

vi.mock("next/link", () => ({
  default({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

describe("ProductShell", () => {
  it("renders accessible product navigation and skip link", async () => {
    const { container } = render(
      <ProductShell
        active="blast-radius"
        eyebrow="Blast radius"
        title="Blast radius"
        description="Potential exposure across seeded paths."
      >
        <p>Seeded blast-radius content</p>
      </ProductShell>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#content");
    expect(
      screen.getAllByRole("link", { name: /Blast radius/i })[0],
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Seeded blast-radius content")).toBeInTheDocument();
    expect((await axe.run(container)).violations).toHaveLength(0);
  });
});

describe("EmptyState", () => {
  it("explains empty product states without rendering a blank panel", () => {
    render(
      <EmptyState
        title="No failed propagation jobs"
        detail="Failures will appear here with a retry action."
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No failed propagation jobs" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/retry action/i)).toBeInTheDocument();
  });
});
