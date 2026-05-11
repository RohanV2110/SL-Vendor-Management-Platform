"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
};

export function SubmitButton({
  label,
  pendingLabel,
  className,
  disabled,
  title
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || Boolean(disabled);

  return (
    <button
      className={className ?? "button"}
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      title={title}
    >
      {pending ? pendingLabel ?? "Saving..." : label}
    </button>
  );
}
