/**
 * Generated-style typed schema for the PainPilot Supabase database.
 *
 * Until `supabase gen types typescript --linked` is wired into CI, this file
 * is hand-maintained to mirror /supabase/migrations/*.sql. Keep them in sync.
 * The shape matches what supabase-js consumes for its `Database` generic.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Plan = "free" | "pro" | "studio" | "agency";
export type LlmKind = "hot" | "premium" | "research" | "embed" | "rerank";
export type CrawlSourceId =
  | "reddit"
  | "hn"
  | "ph"
  | "app_store"
  | "play_store"
  | "trustpilot"
  | "g2"
  | "ih";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          handle: string | null;
          plan: Plan;
          stripe_customer_id: string | null;
          polar_customer_id: string | null;
          byok_anthropic: boolean;
          byok_groq: boolean;
          byok_openai: boolean;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          handle?: string | null;
          plan?: Plan;
          stripe_customer_id?: string | null;
          polar_customer_id?: string | null;
          byok_anthropic?: boolean;
          byok_groq?: boolean;
          byok_openai?: boolean;
          role?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: number;
          user_id: string;
          kind: string;
          meta: Json;
          tokens_in: number | null;
          tokens_out: number | null;
          cost_usd: number | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          kind: string;
          meta?: Json;
          tokens_in?: number | null;
          tokens_out?: number | null;
          cost_usd?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["usage_events"]["Insert"]>;
        Relationships: [];
      };
      models: {
        Row: {
          id: string;
          provider: string;
          model: string;
          kind: LlmKind;
          input_per_1m: number | null;
          output_per_1m: number | null;
          context_window: number | null;
          supports_json: boolean;
          supports_tools: boolean;
          supports_vision: boolean;
          supports_caching: boolean;
          quality_score: number | null;
          latency_p50: number | null;
          active: boolean;
          deprecated_at: string | null;
          created_at: string;
        };
        Insert: {
          provider: string;
          model: string;
          kind: LlmKind;
          input_per_1m?: number | null;
          output_per_1m?: number | null;
          context_window?: number | null;
          supports_json?: boolean;
          supports_tools?: boolean;
          supports_vision?: boolean;
          supports_caching?: boolean;
          quality_score?: number | null;
          latency_p50?: number | null;
          active?: boolean;
          deprecated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["models"]["Insert"]>;
        Relationships: [];
      };
      prompts: {
        Row: {
          name: string;
          version: string;
          body: string;
          schema_json: Json | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          name: string;
          version: string;
          body: string;
          schema_json?: Json | null;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["prompts"]["Insert"]>;
        Relationships: [];
      };
      llm_traces: {
        Row: {
          id: string;
          user_id: string | null;
          purpose: string;
          provider: string;
          model: string;
          prompt_name: string | null;
          prompt_version: string | null;
          prompt_hash: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          cost_usd: number | null;
          latency_ms: number | null;
          cache_hit: boolean;
          score: number | null;
          trace_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          purpose: string;
          provider: string;
          model: string;
          prompt_name?: string | null;
          prompt_version?: string | null;
          prompt_hash?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cost_usd?: number | null;
          latency_ms?: number | null;
          cache_hit?: boolean;
          score?: number | null;
          trace_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["llm_traces"]["Insert"]>;
        Relationships: [];
      };
      github_installations: {
        Row: {
          user_id: string;
          installation_id: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          installation_id: number;
        };
        Update: Partial<Database["public"]["Tables"]["github_installations"]["Insert"]>;
        Relationships: [];
      };
      crawl_sources: {
        Row: {
          id: CrawlSourceId;
          enabled: boolean;
          params: Json;
          created_at: string;
        };
        Insert: {
          id: CrawlSourceId;
          enabled?: boolean;
          params?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["crawl_sources"]["Insert"]>;
        Relationships: [];
      };
      crawl_runs: {
        Row: {
          id: string;
          source: CrawlSourceId;
          started_at: string;
          finished_at: string | null;
          cursor: string | null;
          items_fetched: number;
          items_kept: number;
          error: string | null;
        };
        Insert: {
          source: CrawlSourceId;
          finished_at?: string | null;
          cursor?: string | null;
          items_fetched?: number;
          items_kept?: number;
          error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crawl_runs"]["Insert"]>;
        Relationships: [];
      };
      // pgvector columns surface as `string` over the wire (Postgres serializes
      // them as text like "[0.1, 0.2, ...]"). The router code parses them when
      // it needs numeric work; for the typed client they're just strings.
      clusters: {
        Row: {
          id: string;
          centroid: string;
          member_count: number;
          title: string | null;
          summary: string | null;
          pain_score: number | null;
          audience: string | null;
          keywords: string[] | null;
          last_signal_at: string;
          created_at: string;
        };
        Insert: {
          centroid: string;
          member_count?: number;
          title?: string | null;
          summary?: string | null;
          pain_score?: number | null;
          audience?: string | null;
          keywords?: string[] | null;
          last_signal_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clusters"]["Insert"]>;
        Relationships: [];
      };
      signals: {
        Row: {
          id: string;
          source: CrawlSourceId;
          source_id: string;
          url: string;
          title: string | null;
          body: string;
          author: string | null;
          author_collected_at: string | null;
          posted_at: string;
          score: number | null;
          comments_count: number | null;
          embedding: string | null;
          cluster_id: string | null;
          extracted: Json | null;
          created_at: string;
        };
        Insert: {
          source: CrawlSourceId;
          source_id: string;
          url: string;
          title?: string | null;
          body: string;
          author?: string | null;
          author_collected_at?: string | null;
          posted_at: string;
          score?: number | null;
          comments_count?: number | null;
          embedding?: string | null;
          cluster_id?: string | null;
          extracted?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["signals"]["Insert"]>;
        Relationships: [];
      };
      cluster_saves: {
        Row: {
          user_id: string;
          cluster_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          cluster_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["cluster_saves"]["Insert"]>;
        Relationships: [];
      };
      specs: {
        Row: {
          id: string;
          user_id: string;
          cluster_id: string;
          version: number;
          status: "draft" | "locked";
          audience: Json | null;
          competitors: Json | null;
          wtp: Json | null;
          pricing: Json | null;
          features: Json | null;
          gtm: Json | null;
          locked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          cluster_id: string;
          version?: number;
          status?: "draft" | "locked";
          audience?: Json | null;
          competitors?: Json | null;
          wtp?: Json | null;
          pricing?: Json | null;
          features?: Json | null;
          gtm?: Json | null;
          locked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["specs"]["Insert"]>;
        Relationships: [];
      };
      spec_events: {
        Row: {
          id: number;
          spec_id: string;
          kind: "section_generated" | "edited" | "locked" | "unlocked";
          section: string | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          spec_id: string;
          kind: "section_generated" | "edited" | "locked" | "unlocked";
          section?: string | null;
          payload?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["spec_events"]["Insert"]>;
        Relationships: [];
      };
      ship_templates: {
        Row: {
          id: string;
          name: string;
          repo_url: string;
          default_branch: string;
          manifest: Json;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          repo_url: string;
          default_branch?: string;
          manifest?: Json;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["ship_templates"]["Insert"]>;
        Relationships: [];
      };
      ship_runs: {
        Row: {
          id: string;
          user_id: string;
          spec_id: string;
          template_id: string;
          status:
            | "queued"
            | "scaffolding"
            | "generating"
            | "pushing"
            | "deploying"
            | "done"
            | "failed";
          repo_owner: string | null;
          repo_name: string | null;
          repo_url: string | null;
          installation_id: number | null;
          default_branch: string | null;
          vercel_project_id: string | null;
          deploy_url: string | null;
          error: string | null;
          started_at: string;
          finished_at: string | null;
          metrics: Json;
        };
        Insert: {
          user_id: string;
          spec_id: string;
          template_id: string;
          status?: Database["public"]["Tables"]["ship_runs"]["Row"]["status"];
          repo_owner?: string | null;
          repo_name?: string | null;
          repo_url?: string | null;
          installation_id?: number | null;
          default_branch?: string | null;
          vercel_project_id?: string | null;
          deploy_url?: string | null;
          error?: string | null;
          finished_at?: string | null;
          metrics?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["ship_runs"]["Insert"]>;
        Relationships: [];
      };
      ship_files: {
        Row: {
          id: number;
          run_id: string;
          path: string;
          sha: string | null;
          bytes: number | null;
          generated_by: string;
        };
        Insert: {
          run_id: string;
          path: string;
          sha?: string | null;
          bytes?: number | null;
          generated_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["ship_files"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          ship_run_id: string;
          user_id: string;
          polar_product_id: string | null;
          slug: string;
          name: string;
          status: "private" | "public";
          revenue_share_bps: number;
          created_at: string;
        };
        Insert: {
          ship_run_id: string;
          user_id: string;
          polar_product_id?: string | null;
          slug: string;
          name: string;
          status?: "private" | "public";
          revenue_share_bps?: number;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      product_metrics: {
        Row: {
          id: number;
          product_id: string;
          snapshot_at: string;
          mrr_usd: number | null;
          arr_usd: number | null;
          users_count: number | null;
          active_users_count: number | null;
          churn_30d: number | null;
          source: "polar" | "self_report" | "stripe_proxy";
        };
        Insert: {
          product_id: string;
          mrr_usd?: number | null;
          arr_usd?: number | null;
          users_count?: number | null;
          active_users_count?: number | null;
          churn_30d?: number | null;
          source: "polar" | "self_report" | "stripe_proxy";
        };
        Update: Partial<Database["public"]["Tables"]["product_metrics"]["Insert"]>;
        Relationships: [];
      };
      product_events: {
        Row: {
          id: number;
          product_id: string;
          kind: string;
          payload: Json;
          polar_event_id: string | null;
          received_at: string;
        };
        Insert: {
          product_id: string;
          kind: string;
          payload: Json;
          polar_event_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["product_events"]["Insert"]>;
        Relationships: [];
      };
      payouts: {
        Row: {
          id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          gross_usd: number;
          fee_usd: number;
          net_usd: number;
          status: "pending" | "sent" | "failed";
          polar_payout_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          period_start: string;
          period_end: string;
          gross_usd?: number;
          fee_usd?: number;
          net_usd?: number;
          status?: "pending" | "sent" | "failed";
          polar_payout_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payouts"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      plan_t: Plan;
    };
    CompositeTypes: Record<string, never>;
  };
}
