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
    <div className="admin-notification-list">
      {notifications.map((notification) => (
        <article className="notification-card notification-card--new" key={notification.id}>
          <div className="notification-card__header">
            <span className="notification-new-label">New</span>
            <time className="notification-card__time muted" dateTime={notification.createdAt}>
              {formatDateTime(notification.createdAt)}
            </time>
          </div>
          <h3 className="notification-card__title">{notification.title}</h3>
          <p className="notification-card__body muted">{notification.body}</p>
          <form action={markAdminNotificationReadAction} className="notification-card__form">
            <input type="hidden" name="notificationId" value={notification.id} />
            <SubmitButton
              className="button button-secondary notification-card__read-btn"
              label="Mark as read"
              pendingLabel="Saving..."
            />
          </form>
        </article>
      ))}
    </div>
  );
}
