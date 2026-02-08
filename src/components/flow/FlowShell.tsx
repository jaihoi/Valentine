import type { ComponentPropsWithoutRef } from "react";

type FlowShellProps = ComponentPropsWithoutRef<"main"> & {
  moduleId?: string;
};

function joinClasses(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function FlowShell({
  moduleId,
  className,
  children,
  ...props
}: FlowShellProps) {
  return (
    <main
      className={joinClasses("flow-shell", moduleId ? `flow-shell--${moduleId}` : undefined, className)}
      {...props}
    >
      {children}
    </main>
  );
}
