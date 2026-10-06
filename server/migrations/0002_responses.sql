CREATE TYPE "public"."consent_decision" AS ENUM('authorized', 'declined');--> statement-breakpoint
CREATE TABLE "consents" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"decision" "consent_decision" NOT NULL,
	"version" text NOT NULL,
	"text_hash" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ficha_answers" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"data_enc" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answers" (
	"participant_id" uuid NOT NULL,
	"instrument" text NOT NULL,
	"data_enc" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_answers_participant_id_instrument_pk" PRIMARY KEY("participant_id","instrument")
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_answers" ADD CONSTRAINT "ficha_answers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;