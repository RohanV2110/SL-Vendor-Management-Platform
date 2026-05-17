"use client";

import { markAdminNotificationReadAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/utils";

export type AdminNotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type AdminNotificationListProps = {
  notifications: AdminNotificationItem[];
};

export function AdminNotificationList({ notifications }: AdminNotificationListProps) {
  if (!notifications.length) {
    return <div className="empty-state">No new notifications.</div>;
  }

  return (
    <div className="stack-md">
      {notifications.map((notification) => (
        <article className="notification-card notification-card--new" key={notification.id}>
          <span className="notification-new-label">New</span>
          <div className="inline-form" style={{ justifyContent: "space-between" }}>
            <strong>{notification.title}</strong>
            <span className="muted">{formatDateTime(notification.createdAt)}</span>
          </div>
          <p className="muted">{notification.body}</p>
          <form action={markAdminNotificationReadAction} style={{ marginTop: 8 }}>
            <input type="hidden" name="notificationId" value={notification.id} />
            <SubmitButton
              className="button button-secondary"
              label="Mark as read"
              pendingLabel="Saving..."
            />
          </form>
        </article>
      ))}
    </div>
  );
}
