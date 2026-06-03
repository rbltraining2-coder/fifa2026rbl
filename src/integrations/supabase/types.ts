export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      eligible_employees: {
        Row: {
          created_at: string
          date_of_birth: string
          employee_id: string
          name: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          employee_id: string
          name: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          employee_id?: string
          name?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          api_id: string | null
          away_flag: string | null
          away_score: number | null
          away_team: string
          created_at: string
          home_flag: string | null
          home_score: number | null
          home_team: string
          id: string
          match_time: string
          stadium: string | null
          stage_name: string | null
          status: string
        }
        Insert: {
          api_id?: string | null
          away_flag?: string | null
          away_score?: number | null
          away_team: string
          created_at?: string
          home_flag?: string | null
          home_score?: number | null
          home_team: string
          id?: string
          match_time: string
          stadium?: string | null
          stage_name?: string | null
          status?: string
        }
        Update: {
          api_id?: string | null
          away_flag?: string | null
          away_score?: number | null
          away_team?: string
          created_at?: string
          home_flag?: string | null
          home_score?: number | null
          home_team?: string
          id?: string
          match_time?: string
          stadium?: string | null
          stage_name?: string | null
          status?: string
        }
        Relationships: []
      }
      predictions: {
        Row: {
          created_at: string
          id: string
          match_id: string
          points_earned: number
          predicted_away_score: number | null
          predicted_home_score: number | null
          total_goals_bucket: string | null
          updated_at: string
          user_id: string
          winner: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          points_earned?: number
          predicted_away_score?: number | null
          predicted_home_score?: number | null
          total_goals_bucket?: string | null
          updated_at?: string
          user_id: string
          winner?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          points_earned?: number
          predicted_away_score?: number | null
          predicted_home_score?: number | null
          total_goals_bucket?: string | null
          updated_at?: string
          user_id?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "registered_users"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          brand: string | null
          created_at: string
          employee_code: string
          id: string
          name: string
          rank: number | null
          total_points: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          brand?: string | null
          created_at?: string
          employee_code: string
          id: string
          name?: string
          rank?: number | null
          total_points?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          brand?: string | null
          created_at?: string
          employee_code?: string
          id?: string
          name?: string
          rank?: number | null
          total_points?: number
          updated_at?: string
        }
        Relationships: []
      }
      registered_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string
          employee_id: string
          id: string
          is_admin: boolean
          name: string
          rank: number | null
          total_points: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth: string
          employee_id: string
          id?: string
          is_admin?: boolean
          name: string
          rank?: number | null
          total_points?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string
          employee_id?: string
          id?: string
          is_admin?: boolean
          name?: string
          rank?: number | null
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registered_users_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "eligible_employees"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      reward_winners: {
        Row: {
          computed_at: string
          id: string
          period_end: string
          period_key: string
          period_label: string
          period_start: string
          period_type: string
          rank: number
          total_points: number
          user_id: string
        }
        Insert: {
          computed_at?: string
          id?: string
          period_end: string
          period_key: string
          period_label: string
          period_start: string
          period_type: string
          rank?: number
          total_points?: number
          user_id: string
        }
        Update: {
          computed_at?: string
          id?: string
          period_end?: string
          period_key?: string
          period_label?: string
          period_start?: string
          period_type?: string
          rank?: number
          total_points?: number
          user_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          failed_count: number
          failures: Json | null
          id: string
          predictions_scored: number
          processed: number
          received: number
          source: string
          status: string
          updated: number
          users_refreshed: number
        }
        Insert: {
          created?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          failures?: Json | null
          id?: string
          predictions_scored?: number
          processed?: number
          received?: number
          source?: string
          status?: string
          updated?: number
          users_refreshed?: number
        }
        Update: {
          created?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          failures?: Json | null
          id?: string
          predictions_scored?: number
          processed?: number
          received?: number
          source?: string
          status?: string
          updated?: number
          users_refreshed?: number
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_code: string
          badge_description: string
          badge_label: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_code: string
          badge_description: string
          badge_label: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_code?: string
          badge_description?: string
          badge_label?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          match_id: string
          user_id: string
          voted_team: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          user_id: string
          voted_team: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          user_id?: string
          voted_team?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_winners: {
        Row: {
          created_at: string
          id: string
          total_points: number
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          total_points?: number
          user_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          total_points?: number
          user_id?: string
          week_number?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recalculate_rewards_and_badges: { Args: never; Returns: Json }
      refresh_scoring_totals_rewards: {
        Args: { _match_ids?: string[] }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
