CREATE TABLE "parcel_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_address" text NOT NULL,
	"address" text NOT NULL,
	"lon" double precision,
	"lat" double precision,
	"fips" text,
	"resolved" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "feasibility_runs" ADD COLUMN "resolved_parcel" jsonb;--> statement-breakpoint
CREATE INDEX "parcel_lookups_addr_idx" ON "parcel_lookups" USING btree ("normalized_address","created_at");