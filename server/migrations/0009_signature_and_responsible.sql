ALTER TABLE "campaigns" ADD COLUMN "responsible_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_enc" text;