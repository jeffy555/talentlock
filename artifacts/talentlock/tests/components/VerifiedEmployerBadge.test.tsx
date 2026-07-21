import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VerifiedEmployerBadge } from "@/components/employer/VerifiedEmployerBadge";

describe("VerifiedEmployerBadge", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders nothing when unverified", () => {
    const { container } = render(<VerifiedEmployerBadge verificationLevel="unverified" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when level is null", () => {
    const { container } = render(<VerifiedEmployerBadge verificationLevel={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Verified Employer for fully_verified", () => {
    render(<VerifiedEmployerBadge verificationLevel="fully_verified" />);
    expect(screen.getByText("Verified Employer")).toBeInTheDocument();
  });

  it("renders ID Verified for partially_verified", () => {
    render(<VerifiedEmployerBadge verificationLevel="partially_verified" />);
    expect(screen.getByText("ID Verified")).toBeInTheDocument();
  });
});
