ALTER TABLE "users" ADD COLUMN "email_blind" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_blind_unique" UNIQUE("email_blind");