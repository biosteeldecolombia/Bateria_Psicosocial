CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "role_permissions_role_permission_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "stage" text DEFAULT 'created' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "owner_application_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "owner_evaluation_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "owner_delivery_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "otp_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "otp_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "otp_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_method" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "initial_password_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trusted_devices_user_idx" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_events_campaign_idx" ON "workflow_events" USING btree ("campaign_id");
--> statement-breakpoint
UPDATE "campaigns" SET "stage" = CASE
  WHEN "status" = 'closed' THEN 'finished'
  WHEN EXISTS (SELECT 1 FROM "participants" p WHERE p."campaign_id" = "campaigns"."id") THEN 'in_progress'
  ELSE 'created' END,
  "stage_changed_at" = COALESCE("closed_at", "created_at");
--> statement-breakpoint
UPDATE "questionnaire_answers" SET "completed_at" = "updated_at" WHERE "complete" = true;
--> statement-breakpoint
UPDATE "participants" SET "review_status" = 'pending';
