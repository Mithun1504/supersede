import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("is keyboard operable and accessible", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Button onClick={onClick}>Continue</Button>);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
    expect(onClick).toHaveBeenCalledOnce();
    expect((await axe.run(container)).violations).toHaveLength(0);
  });
});
