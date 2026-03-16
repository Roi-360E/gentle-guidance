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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      facebook_pixel_config: {
        Row: {
          access_token: string
          created_at: string
          dedup_key: string
          id: string
          is_active: boolean
          name: string
          pixel_id: string
          pixel_snippet: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          created_at?: string
          dedup_key?: string
          id?: string
          is_active?: boolean
          name?: string
          pixel_id?: string
          pixel_snippet?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          dedup_key?: string
          id?: string
          is_active?: boolean
          name?: string
          pixel_id?: string
          pixel_snippet?: string
          updated_at?: string
        }
        Relationships: []
      }
      instagram_connections: {
        Row: {
          created_at: string
          id: string
          instagram_user_id: string
          instagram_username: string | null
          page_access_token: string
          page_id: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_user_id: string
          instagram_username?: string | null
          page_access_token: string
          page_id: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instagram_user_id?: string
          instagram_username?: string | null
          page_access_token?: string
          page_id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          id: string
          pix_tx_id: string | null
          plan: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          pix_tx_id?: string | null
          plan: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          pix_tx_id?: string | null
          plan?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pixel_events_log: {
        Row: {
          created_at: string
          event_name: string
          event_source: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          event_source?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          event_source?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cpf_hash: string | null
          created_at: string
          email: string | null
          has_ai_chat: boolean
          id: string
          is_blocked: boolean
          name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          cpf_hash?: string | null
          created_at?: string
          email?: string | null
          has_ai_chat?: boolean
          id?: string
          is_blocked?: boolean
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          cpf_hash?: string | null
          created_at?: string
          email?: string | null
          has_ai_chat?: boolean
          id?: string
          is_blocked?: boolean
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signup_guards: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          email_domain: string
          id: string
          ip_address: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          email_domain: string
          id?: string
          ip_address: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          email_domain?: string
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          bg_color: string
          color: string
          created_at: string
          features: Json
          has_ai_chat: boolean
          has_auto_subtitles: boolean
          has_voice_rewrite: boolean
          icon: string
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          plan_key: string
          price: number
          sort_order: number
          tokens: number
          updated_at: string
        }
        Insert: {
          bg_color?: string
          color?: string
          created_at?: string
          features?: Json
          has_ai_chat?: boolean
          has_auto_subtitles?: boolean
          has_voice_rewrite?: boolean
          icon?: string
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          plan_key: string
          price?: number
          sort_order?: number
          tokens?: number
          updated_at?: string
        }
        Update: {
          bg_color?: string
          color?: string
          created_at?: string
          features?: Json
          has_ai_chat?: boolean
          has_auto_subtitles?: boolean
          has_voice_rewrite?: boolean
          icon?: string
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          plan_key?: string
          price?: number
          sort_order?: number
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      subtitles: {
        Row: {
          created_at: string
          font_size: string
          generated_text: string | null
          id: string
          original_text: string | null
          style: string
          title: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          font_size?: string
          generated_text?: string | null
          id?: string
          original_text?: string | null
          style?: string
          title?: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          font_size?: string
          generated_text?: string | null
          id?: string
          original_text?: string | null
          style?: string
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      testimonial_submissions: {
        Row: {
          expires_at: string
          id: string
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          expires_at?: string
          id?: string
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          charge_attempts: number
          created_at: string
          id: string
          last_charge_at: string | null
          mp_card_id: string | null
          mp_customer_id: string | null
          next_charge_at: string | null
          selected_plan: string
          status: string
          trial_ends_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charge_attempts?: number
          created_at?: string
          id?: string
          last_charge_at?: string | null
          mp_card_id?: string | null
          mp_customer_id?: string | null
          next_charge_at?: string | null
          selected_plan: string
          status?: string
          trial_ends_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charge_attempts?: number
          created_at?: string
          id?: string
          last_charge_at?: string | null
          mp_card_id?: string | null
          mp_customer_id?: string | null
          next_charge_at?: string | null
          selected_plan?: string
          status?: string
          trial_ends_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      utm_tracking: {
        Row: {
          captured_at: string
          id: string
          landing_page: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          captured_at?: string
          id?: string
          landing_page?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          captured_at?: string
          id?: string
          landing_page?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      video_usage: {
        Row: {
          created_at: string
          id: string
          month_year: string
          plan: string
          token_balance: number
          tts_credits: number
          updated_at: string
          user_id: string
          video_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          month_year: string
          plan?: string
          token_balance?: number
          tts_credits?: number
          updated_at?: string
          user_id: string
          video_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          month_year?: string
          plan?: string
          token_balance?: number
          tts_credits?: number
          updated_at?: string
          user_id?: string
          video_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
