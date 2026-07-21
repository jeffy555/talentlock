import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaginationControls } from "@/components/PaginationControls";

describe("PaginationControls", () => {
  afterEach(() => {
    cleanup();
  });
  it("returns null when totalPages is 1", () => {
    const { container } = render(
      <PaginationControls page={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("disables Prev on first page", () => {
    render(<PaginationControls page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
  });

  it("disables Next on last page", () => {
    render(<PaginationControls page={3} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /prev/i })).not.toBeDisabled();
  });

  it("calls onPageChange when Next clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<PaginationControls page={2} totalPages={3} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
