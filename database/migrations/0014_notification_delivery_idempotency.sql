-- A delivery row carries its own bounded attempt counter, so retries update the same row.
-- Enforce that invariant even when multiple dispatcher instances race.
CREATE UNIQUE INDEX notification_delivery_notification_channel_uq
ON notification_delivery (notification_id, channel);
