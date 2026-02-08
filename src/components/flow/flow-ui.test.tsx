import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlowErrorAlert } from "./FlowErrorAlert";
import { FlowHeader } from "./FlowHeader";
import { FlowStatus } from "./FlowStatus";

describe("Flow UI kit", () => {
  it("renders step badges and current step in header", () => {
    const html = renderToStaticMarkup(
      <FlowHeader
        eyebrow="Flow 1"
        title="Onboarding + Date Plan"
        subtitle="Strict provider mode"
        signedInEmail="user@example.com"
        steps={[
          { label: "1. Auth", active: true },
          { label: "2. Partner", active: false },
        ]}
        currentStepLabel="Auth"
      />,
    );

    expect(html).toContain("flow-step active");
    expect(html).toContain("Signed in as: user@example.com");
    expect(html).toContain("Current step: Auth");
  });

  it("renders typed error details with retry action", () => {
    const html = renderToStaticMarkup(
      <FlowErrorAlert
        error={{
          message: "Timed out",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "vapi",
        }}
        loading={false}
        testId="flow-test-error-panel"
        retryTestId="flow-test-error-retry"
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="flow-test-error-panel"');
    expect(html).toContain('data-testid="flow-test-error-retry"');
    expect(html).toContain("Code: <strong>PROVIDER_TIMEOUT</strong>");
    expect(html).toContain("Provider: vapi");
    expect(html).toContain("Retryable: true");
  });

  it("renders loading and success statuses with polite announcements", () => {
    const html = renderToStaticMarkup(
      <FlowStatus loading loadingMessage="Working now" successMessage="Saved." />,
    );

    expect(html).toContain("Working now");
    expect(html).toContain("Saved.");
    expect(html).toContain('aria-live="polite"');
  });
});
