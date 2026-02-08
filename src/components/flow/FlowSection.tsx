import type { ComponentPropsWithoutRef } from "react";

type FlowSectionProps = ComponentPropsWithoutRef<"section"> & {
  tone?: "default" | "result" | "processing" | "media";
};

function joinClasses(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function FlowSection({
  tone = "default",
  className,
  children,
  ...props
}: FlowSectionProps) {
  return (
    <section
      className={joinClasses(
        "flow-panel",
        tone !== "default" ? `flow-panel--${tone}` : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
