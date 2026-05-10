"use client";

import { useEffect, useState } from "react";
import { acknowledgePartnerActivationAction } from "@/lib/actions";

export function PartnerActivationToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    void acknowledgePartnerActivationAction();
    const timer = setTimeout(() => {
      setVisible(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="status-banner status-banner--success" role="status" aria-live="polite">
      <strong>Account activated by the admin.</strong>
    </div>
  );
}
