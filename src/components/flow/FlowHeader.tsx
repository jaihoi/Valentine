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
  return (
    <header className={joinClasses("flow-header", className)} {...props}>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="flow-subtitle">{subtitle}</p>
      {signedInEmail && <p className="flow-current">Signed in as: {signedInEmail}</p>}
      <div className="flow-steps">
        {steps.map((step) => (
          <span key={step.label} className={step.active ? "flow-step active" : "flow-step"}>
            {step.label}
          </span>
        ))}
      </div>
      <p className="flow-current">Current step: {currentStepLabel}</p>
    </header>
  );
}
