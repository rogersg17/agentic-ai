CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"actor_id" uuid NOT NULL,
	"actor_type" varchar(50) NOT NULL,
	"action" varchar(255) NOT NULL,
	"entity_type" varchar(255) NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"triggered_by" uuid,
	"trigger_source" varchar(50) NOT NULL,
	"ci_build_id" varchar(255),
	"git_commit" varchar(255),
	"git_branch" varchar(255),
	"environment" varchar(255),
	"browser_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shard_count" integer DEFAULT 1 NOT NULL,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"total_tests" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"flaky" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"requirement_neo4j_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_object_neo4j_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_exemplar_neo4j_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"generated_test_neo4j_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_model_used" varchar(255),
	"token_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "healing_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_result_id" uuid NOT NULL,
	"test_case_neo4j_id" varchar(255) NOT NULL,
	"change_type" varchar(50) NOT NULL,
	"risk_level" varchar(50) NOT NULL,
	"original_code" text NOT NULL,
	"proposed_code" text NOT NULL,
	"unified_diff" text NOT NULL,
	"explanation" text NOT NULL,
	"confidence_score" real NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"policy_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"git_repos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"test_case_neo4j_id" varchar(255) NOT NULL,
	"status" varchar(50) NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"stack_trace" text,
	"failure_classification" varchar(50),
	"classification_confidence" real,
	"screenshot_url" text,
	"trace_url" text,
	"dom_snapshot_url" text,
	"log_url" text,
	"shard_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_runs" ADD CONSTRAINT "execution_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_runs" ADD CONSTRAINT "execution_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_requests" ADD CONSTRAINT "generation_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_requests" ADD CONSTRAINT "generation_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "healing_proposals" ADD CONSTRAINT "healing_proposals_test_result_id_test_results_id_fk" FOREIGN KEY ("test_result_id") REFERENCES "public"."test_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "healing_proposals" ADD CONSTRAINT "healing_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_run_id_execution_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."execution_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_project_id_idx" ON "audit_log" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "execution_runs_project_id_idx" ON "execution_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "execution_runs_status_idx" ON "execution_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "execution_runs_created_at_idx" ON "execution_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generation_requests_project_id_idx" ON "generation_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generation_requests_status_idx" ON "generation_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generation_requests_created_at_idx" ON "generation_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "healing_proposals_test_result_id_idx" ON "healing_proposals" USING btree ("test_result_id");--> statement-breakpoint
CREATE INDEX "healing_proposals_status_idx" ON "healing_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "healing_proposals_created_at_idx" ON "healing_proposals" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "test_results_run_id_idx" ON "test_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "test_results_status_idx" ON "test_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "test_results_created_at_idx" ON "test_results" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");