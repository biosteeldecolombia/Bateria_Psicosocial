ALTER TYPE "public"."role" ADD VALUE 'assistant';--> statement-breakpoint
CREATE TABLE "assistant_campaigns" (
	"user_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	CONSTRAINT "assistant_campaigns_user_id_campaign_id_pk" PRIMARY KEY("user_id","campaign_id")
);
--> statement-breakpoint
CREATE TABLE "assistant_companies" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	CONSTRAINT "assistant_companies_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "assistant_campaigns" ADD CONSTRAINT "assistant_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_campaigns" ADD CONSTRAINT "assistant_campaigns_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_companies" ADD CONSTRAINT "assistant_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_companies" ADD CONSTRAINT "assistant_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;