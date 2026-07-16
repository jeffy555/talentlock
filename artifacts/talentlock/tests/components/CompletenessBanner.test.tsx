import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompletenessBanner } from "@/components/CompletenessBanner";

describe("CompletenessBanner", () => {
  afterEach(() => {
    cleanup();
  });
  const incompleteProfile = {
    bio: "short",
    skills: ["one"],
    hourlyRate: null,
    fieldOfWork: null,
    isAvailable: null,
  };

  it("shows missing fields when score below 60", () => {
    render(<CompletenessBanner score={30} profile={incompleteProfile} hasAvatar={false} />);
    expect(screen.getByText(/Complete your profile to appear in Talent Vault/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a profile photo/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a bio/i)).toBeInTheDocument();
  });

  it("shows vault-visible message when score >= 60 but not 100", () => {
    render(
      <CompletenessBanner
        score={75}
        profile={{
          bio: "x".repeat(50),
          skills: ["a", "b"],
          hourlyRate: 100,
          fieldOfWork: "Engineering",
          isAvailable: true,
        }}
        hasAvatar={true}
      />,
    );
    expect(screen.getByText(/Your profile is visible in Talent Vault/i)).toBeInTheDocument();
  });

  it("renders nothing at 100%", () => {
    const { container } = render(
      <CompletenessBanner score={100} profile={incompleteProfile} hasAvatar={true} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
