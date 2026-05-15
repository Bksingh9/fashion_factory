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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      plan_t: Plan;
    };
    CompositeTypes: Record<string, never>;
  };
}
