import type { ComponentPropsWithoutRef } from "react";

type FlowHeaderStep = {
  label: string;
  active: boolean;
};

type FlowHeaderProps = ComponentPropsWithoutRef<"header"> & {
  eyebrow: string;
  title: string;
  subtitle: string;
  signedInEmail?: string | null;
  steps: FlowHeaderStep[];
  currentStepLabel: string;
};

function joinClasses(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function FlowHeader({
  eyebrow,
  title,
  subtitle,
  signedInEmail,
  steps,
  currentStepLabel,
  className,
  ...props
}: FlowHeaderProps) {
  const totalSteps = steps.length;
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.active),
  );
  const currentStep = activeIndex + 1;
  const progressValue = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <header className={joinClasses("flow-header", className)} {...props}>
      <div className="flow-header-top">
        <p className="eyebrow">{eyebrow}</p>
        {signedInEmail && <p className="flow-signed-in">Signed in as: {signedInEmail}</p>}
      </div>
      <h1>{title}</h1>
      <p className="flow-subtitle">{subtitle}</p>
      <div className="flow-progress" role="status" aria-live="polite">
        <div className="flow-progress-meta">
          <p className="flow-current">
            Step {currentStep} of {totalSteps}
          </p>
          <p className="flow-current">{currentStepLabel}</p>
        </div>
        <div className="flow-progress-track" aria-hidden="true">
          <span
            className="flow-progress-fill"
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>
    </header>
  );
}
