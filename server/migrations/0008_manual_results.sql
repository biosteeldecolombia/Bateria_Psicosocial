CREATE TABLE "manual_results" (
	"participant_id" uuid NOT NULL,
	"instrument" text NOT NULL,
	"data_enc" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_results_participant_id_instrument_pk" PRIMARY KEY("participant_id","instrument")
);
--> statement-breakpoint
ALTER TABLE "manual_results" ADD CONSTRAINT "manual_results_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;