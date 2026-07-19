import type React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/blast-radius",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("ProductShell", () => {
  it("renders the governed workflow in use order with the demo guide separate", async () => {
    const { container } = render(
      <ProductShell
        active="blast-radius"
        title="Impact review"
        description="Potential exposure across seeded paths."
        viewer={{
          displayName: "Review Owner",
          authenticated: true,
          organizationReady: true,
          authenticationAvailable: true,
        }}
        viewerAction={<button type="button">Sign out</button>}
        workspace={{
          organizationName: "Test Health",
          configuration: "displace",
          changeReference: "CE-TEST",
          reviewCount: 0,
        }}
      >
        <p>Seeded blast-radius content</p>
      </ProductShell>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#content");

    const workflow = screen.getByRole("navigation", {
      name: "Governed workflow",
    });
    const expectedOrder = [
      "Control room",
      "Evidence intake",
      "Source change",
      "Dependency map",
      "Impact review",
      "Decision cases",
      "Remediation",
      "Audit trail",
    ];
    const workflowLinks = within(workflow).getAllByRole("link");

    expect(workflowLinks).toEqual(
      expectedOrder.map((name) => within(workflow).getByRole("link", { name })),
    );
    expect(
      within(workflow).getByRole("link", {
        name: "Impact review",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(workflow).queryByRole("link", { name: "Demo guide" }),
    ).not.toBeInTheDocument();

    const sidebar = container.querySelector("aside");
    expect(sidebar).not.toBeNull();
    const demoGuide = within(sidebar!).getByRole("link", {
      name: "Demo guide",
    });
    expect(
      Boolean(
        workflow.compareDocumentPosition(demoGuide) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    expect(screen.getByText("Seeded blast-radius content")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change color theme" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open workflow navigation" }),
    );
    const mobileWorkflow = await screen.findByRole("navigation", {
      name: "Workflow order",
    });
    expect(
      within(mobileWorkflow).queryByRole("link", { name: /Demo guide/ }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Product guide" }),
      ).getByRole("link", { name: /Demo guide/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
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
