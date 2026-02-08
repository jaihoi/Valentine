type FlowStatusProps = {
  loading?: boolean;
  loadingMessage?: string;
  successMessage?: string | null;
  successTestId?: string;
};

export function FlowStatus({
  loading = false,
  loadingMessage,
  successMessage,
  successTestId,
}: FlowStatusProps) {
  return (
    <>
      {loading && (
        <p className="flow-working" role="status" aria-live="polite">
          {loadingMessage || "Working..."}
        </p>
      )}
      {successMessage && (
        <p
          className="flow-success"
          role="status"
          aria-live="polite"
          data-testid={successTestId}
        >
          {successMessage}
        </p>
      )}
    </>
  );
}
