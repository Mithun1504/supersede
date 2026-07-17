import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentActor } from "@/modules/identity/policy";
import {
  openNotificationAction,
  setNotificationPreferenceAction,
} from "@/modules/notifications/actions";
import {
  listMyNotificationPreferences,
  listMyNotifications,
} from "@/modules/notifications/repository";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await requireCurrentActor();
  const [items, preferences] = await Promise.all([
    listMyNotifications(actor),
    listMyNotificationPreferences(actor),
  ]);
  const preference = new Map(
    preferences.map((item) => [item.channel, item.enabled]),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div>
        <h1 className="text-3xl font-semibold">Notifications</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Actionable notices contain no sensitive response or source content.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
          <CardDescription>
            {items.filter((item) => !item.readAt).length} unread
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length ? (
            items.map((item) => (
              <form
                key={item.id}
                action={openNotificationAction}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
              >
                <input type="hidden" name="notificationId" value={item.id} />
                <input
                  type="hidden"
                  name="actionPath"
                  value={item.actionPath}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    {!item.readAt ? <Badge>New</Badge> : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {item.bodySummary}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {item.createdAt.toLocaleString()}
                  </p>
                </div>
                <Button type="submit" variant="outline" size="sm">
                  Open
                </Button>
              </form>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No notifications yet.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delivery preferences</CardTitle>
          <CardDescription>
            In-app notices always remain available. Choose whether actionable
            notices also reach your email or Slack.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["email", "slack"] as const).map((channel) => {
            const enabled = preference.get(channel) ?? true;
            return (
              <form
                key={channel}
                action={setNotificationPreferenceAction}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">{channel}</p>
                  <p className="text-muted-foreground text-xs">
                    {enabled
                      ? "Immediate delivery enabled"
                      : "External delivery disabled"}
                  </p>
                </div>
                <input type="hidden" name="channel" value={channel} />
                <Button
                  type="submit"
                  name="enabled"
                  value={enabled ? "false" : "true"}
                  variant="outline"
                  size="sm"
                >
                  {enabled ? "Disable" : "Enable"}
                </Button>
              </form>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
