export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string;
          preferred_name: string | null;
          persona_prompt: string | null;
          avatar_asset_id: string | null;
          voice_model_id: string | null;
          last_session_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name: string;
          preferred_name?: string | null;
          persona_prompt?: string | null;
          avatar_asset_id?: string | null;
          voice_model_id?: string | null;
          last_session_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string;
          preferred_name?: string | null;
          persona_prompt?: string | null;
          avatar_asset_id?: string | null;
          voice_model_id?: string | null;
          last_session_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      media_assets: {
        Row: {
          id: string;
          profile_id: string;
          type: Database["public"]["Enums"]["asset_type"];
          storage_path: string;
          duration_seconds: number | null;
          status: Database["public"]["Enums"]["asset_status"];
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: Database["public"]["Enums"]["asset_type"];
          storage_path: string;
          duration_seconds?: number | null;
          status?: Database["public"]["Enums"]["asset_status"];
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          type?: Database["public"]["Enums"]["asset_type"];
          storage_path?: string;
          duration_seconds?: number | null;
          status?: Database["public"]["Enums"]["asset_status"];
          metadata?: Json | null;
          created_at?: string;
        };
      };
      processing_jobs: {
        Row: {
          id: string;
          profile_id: string;
          job_type: Database["public"]["Enums"]["job_type"];
          status: Database["public"]["Enums"]["job_status"];
          output_asset_id: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          job_type: Database["public"]["Enums"]["job_type"];
          status?: Database["public"]["Enums"]["job_status"];
          output_asset_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          job_type?: Database["public"]["Enums"]["job_type"];
          status?: Database["public"]["Enums"]["job_status"];
          output_asset_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          profile_id: string;
          title: string | null;
          context_summary: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          title?: string | null;
          context_summary?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          title?: string | null;
          context_summary?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: Database["public"]["Enums"]["message_role"];
          content: string;
          audio_asset_id: string | null;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: Database["public"]["Enums"]["message_role"];
          content: string;
          audio_asset_id?: string | null;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: {
          conversation_id?: string;
          role?: Database["public"]["Enums"]["message_role"];
          content?: string;
          audio_asset_id?: string | null;
          latency_ms?: number | null;
          created_at?: string;
        };
      };
      memories: {
        Row: {
          id: string;
          profile_id: string;
          label: string;
          content: string;
          embedding: number[] | null;
          importance: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          label: string;
          content: string;
          embedding?: number[] | null;
          importance?: number | null;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          label?: string;
          content?: string;
          embedding?: number[] | null;
          importance?: number | null;
          created_at?: string;
        };
      };
      session_events: {
        Row: {
          id: string;
          profile_id: string;
          session_id: string;
          event_type: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          session_id: string;
          event_type: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          session_id?: string;
          event_type?: string;
          payload?: Json | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      asset_type: "video" | "audio" | "image" | "transcript" | "other";
      asset_status: "pending" | "processing" | "ready" | "failed";
      job_type: "voice_cloning" | "avatar_rig" | "transcription" | "memory_embedding";
      job_status: "queued" | "running" | "succeeded" | "failed";
      message_role: "user" | "assistant" | "system";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
