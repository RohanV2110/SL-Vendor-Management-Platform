"use client";

import type { ButtonHTMLAttributes } from "react";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
  /** When set, this submit targets a different server action than the parent form. */
  formAction?: ButtonHTMLAttributes<HTMLButtonElement>["formAction"];
};

export function ConfirmSubmitButton({
  label,
  confirmMessage,
  className,
  formAction
}: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className ?? "button button-secondary"}
      type="submit"
      formAction={formAction}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
