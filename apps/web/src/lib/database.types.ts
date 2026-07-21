/** Minimal hand-written types for G8 tables (regenerate via MCP later if needed). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ChartDifficulty = 'easy' | 'normal' | 'hard'
export type PlayModeDb = 'classic' | 'zen' | 'daily' | 'blitz'
export type PurchaseStatus = 'pending' | 'confirmed' | 'failed' | 'refunded'
export type UnlockType =
  | 'chart'
  | 'pack'
  | 'continue'
  | 'season_pass'
  | 'helper'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          wallet_address: string | null
          magic_issuer: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          wallet_address?: string | null
          magic_issuer?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          wallet_address?: string | null
          magic_issuer?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      charts: {
        Row: {
          id: string
          title: string
          difficulty: ChartDifficulty
          bpm: number
          duration_ms: number | null
          is_public: boolean
          is_listed: boolean
          track_key: string | null
          pack_id: string | null
          price_cusd: number | null
          art_gradient: string | null
          audio_path: string | null
          chart_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          title: string
          difficulty: ChartDifficulty
          bpm: number
          duration_ms?: number | null
          is_public?: boolean
          is_listed?: boolean
          track_key?: string | null
          pack_id?: string | null
          price_cusd?: number | null
          art_gradient?: string | null
          audio_path?: string | null
          chart_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          difficulty?: ChartDifficulty
          bpm?: number
          duration_ms?: number | null
          is_public?: boolean
          is_listed?: boolean
          track_key?: string | null
          pack_id?: string | null
          price_cusd?: number | null
          art_gradient?: string | null
          audio_path?: string | null
          chart_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      packs: {
        Row: {
          id: string
          title: string
          description: string | null
          price_cusd: number
          art_gradient: string | null
          created_at: string
        }
        Insert: {
          id: string
          title: string
          description?: string | null
          price_cusd: number
          art_gradient?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          price_cusd?: number
          art_gradient?: string | null
          created_at?: string
        }
        Relationships: []
      }
      daily_tracks: {
        Row: {
          day: string
          seed: string
          chart_id: string
          created_at: string
        }
        Insert: {
          day: string
          seed: string
          chart_id: string
          created_at?: string
        }
        Update: {
          day?: string
          seed?: string
          chart_id?: string
          created_at?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          id: string
          user_id: string
          chart_id: string
          mode: PlayModeDb
          score: number
          combo_max: number
          perfects: number
          goods: number
          misses: number
          duration_ms: number | null
          daily_day: string | null
          seed: string | null
          validated: boolean
          client_score: number | null
          taps: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          chart_id: string
          mode: PlayModeDb
          score?: number
          combo_max?: number
          perfects?: number
          goods?: number
          misses?: number
          duration_ms?: number | null
          daily_day?: string | null
          seed?: string | null
          validated?: boolean
          client_score?: number | null
          taps?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          chart_id?: string
          mode?: PlayModeDb
          score?: number
          combo_max?: number
          perfects?: number
          goods?: number
          misses?: number
          duration_ms?: number | null
          daily_day?: string | null
          seed?: string | null
          validated?: boolean
          client_score?: number | null
          taps?: Json
          created_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          id: string
          user_id: string
          sku: string
          amount_cusd: number
          tx_hash: string | null
          status: PurchaseStatus
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          sku: string
          amount_cusd: number
          tx_hash?: string | null
          status?: PurchaseStatus
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          sku?: string
          amount_cusd?: number
          tx_hash?: string | null
          status?: PurchaseStatus
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      unlocks: {
        Row: {
          id: string
          user_id: string
          unlock_type: UnlockType
          unlock_key: string
          source_purchase_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          unlock_type: UnlockType
          unlock_key: string
          source_purchase_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          unlock_type?: UnlockType
          unlock_key?: string
          source_purchase_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      boasts: {
        Row: {
          id: string
          user_id: string
          purchase_id: string | null
          combo: number
          score: number
          chart_title: string | null
          mode: string
          on_chain_id: number | null
          tx_hash: string
          receipt_hash: string | null
          share_slug: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          purchase_id?: string | null
          combo: number
          score: number
          chart_title?: string | null
          mode?: string
          on_chain_id?: number | null
          tx_hash: string
          receipt_hash?: string | null
          share_slug: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          purchase_id?: string | null
          combo?: number
          score?: number
          chart_title?: string | null
          mode?: string
          on_chain_id?: number | null
          tx_hash?: string
          receipt_hash?: string | null
          share_slug?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          id: string
          slug: string
          title: string
          status: string
          entry_fee_cusd: number
          rake_bps: number
          duration_sec: number
          chart_id: string
          capacity: number
          starts_at: string | null
          ends_at: string | null
          on_chain_cup_id: string | null
          contract_address: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          status?: string
          entry_fee_cusd: number
          rake_bps?: number
          duration_sec?: number
          chart_id?: string
          capacity?: number
          starts_at?: string | null
          ends_at?: string | null
          on_chain_cup_id?: string | null
          contract_address?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          status?: string
          entry_fee_cusd?: number
          rake_bps?: number
          duration_sec?: number
          chart_id?: string
          capacity?: number
          starts_at?: string | null
          ends_at?: string | null
          on_chain_cup_id?: string | null
          contract_address?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournament_entries: {
        Row: {
          id: string
          tournament_id: string
          user_id: string
          purchase_id: string | null
          tx_hash: string
          amount_cusd: number
          network: string
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          user_id: string
          purchase_id?: string | null
          tx_hash: string
          amount_cusd: number
          network?: string
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          user_id?: string
          purchase_id?: string | null
          tx_hash?: string
          amount_cusd?: number
          network?: string
          created_at?: string
        }
        Relationships: []
      }
      tournament_runs: {
        Row: {
          id: string
          tournament_id: string
          entry_id: string
          user_id: string
          tiles: number
          score: number
          combo_max: number
          duration_ms: number | null
          chart_id: string | null
          validated: boolean
          taps: Json
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          entry_id: string
          user_id: string
          tiles: number
          score?: number
          combo_max?: number
          duration_ms?: number | null
          chart_id?: string | null
          validated?: boolean
          taps?: Json
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          entry_id?: string
          user_id?: string
          tiles?: number
          score?: number
          combo_max?: number
          duration_ms?: number | null
          chart_id?: string | null
          validated?: boolean
          taps?: Json
          created_at?: string
        }
        Relationships: []
      }
      tournament_payouts: {
        Row: {
          id: string
          tournament_id: string
          user_id: string
          place: number
          tiles: number
          gross_pool_cusd: number
          rake_cusd: number
          prize_cusd: number
          status: string
          tx_hash: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          user_id: string
          place: number
          tiles: number
          gross_pool_cusd: number
          rake_cusd: number
          prize_cusd: number
          status?: string
          tx_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          user_id?: string
          place?: number
          tiles?: number
          gross_pool_cusd?: number
          rake_cusd?: number
          prize_cusd?: number
          status?: string
          tx_hash?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type ChartRow = Database['public']['Tables']['charts']['Row']
