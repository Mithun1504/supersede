import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { memberships, organizations } from "@/db/schema/identity/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import { connectionStatus, integrationType } from "@/db/schema/shared/enums";

export const integrationConnections = pgTable(
  "integration_connection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    type: integrationType("type").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: connectionStatus("status").notNull().default("draft"),
    externalAccountId: varchar("external_account_id", { length: 255 }),
    credentialReference: text("credential_reference"),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastVerifiedAt: timestamptz("last_verified_at"),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integration_connection_active_name_uq")
      .on(t.organizationId, t.type, t.name)
      .where(sql`${t.status} <> 'disabled'`),
  ],
);
