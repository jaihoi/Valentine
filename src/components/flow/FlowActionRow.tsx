import type { ComponentPropsWithoutRef } from "react";

type FlowActionRowProps = ComponentPropsWithoutRef<"div"> & {
  sticky?: boolean;
};

function joinClasses(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function FlowActionRow({
  sticky = false,
  className,
  children,
  ...props
}: FlowActionRowProps) {
  return (
    <div
      className={joinClasses(
        "button-row",
        "flow-action-row",
        sticky ? "flow-action-row--sticky" : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
