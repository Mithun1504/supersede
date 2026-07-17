-- Resolve only the tenant and local delivery ID for a provider message. Webhook processing
-- immediately re-enters tenant RLS before reading or updating notification content.
CREATE OR REPLACE FUNCTION app.resolve_notification_delivery(provider_message text)
RETURNS TABLE (organization_id uuid, notification_delivery_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id, id
  FROM notification_delivery
  WHERE channel = 'email' AND provider_message_id = provider_message
  LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.resolve_notification_delivery(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.resolve_notification_delivery(text) TO supersede_app, supersede_worker;
