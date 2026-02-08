import { type RefObject } from "react";

type FlowErrorLike = {
  message: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
};

type FlowErrorAlertProps = {
  error: FlowErrorLike | null;
  loading: boolean;
  testId: string;
  retryTestId: string;
  panelRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  onRetry?: () => void;
};

export function FlowErrorAlert({
  error,
  loading,
  testId,
  retryTestId,
  panelRef,
  onDismiss,
  onRetry,
}: FlowErrorAlertProps) {
  if (!error) return null;

  return (
    <section
      ref={panelRef}
      className="flow-error"
      data-testid={testId}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
    >
      <h3>Action failed</h3>
      <p>{error.message}</p>
      <p>
        Code: <strong>{error.code ?? "UNKNOWN"}</strong>
        {error.provider ? ` | Provider: ${error.provider}` : ""}
        {typeof error.retryable === "boolean"
          ? ` | Retryable: ${String(error.retryable)}`
          : ""}
      </p>
      <div className="button-row flow-action-row flow-action-row--sticky">
        <button type="button" onClick={onDismiss} disabled={loading}>
          Dismiss
        </button>
        {error.retryable && onRetry && (
          <button
            data-testid={retryTestId}
            type="button"
            onClick={onRetry}
            disabled={loading}
          >
            Retry
          </button>
        )}
      </div>
    </section>
  );
}
