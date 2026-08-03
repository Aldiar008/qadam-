export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_hash: string | null
          before_hash: string | null
          business_id: string
          created_at: string
          id: string
          is_mock: boolean
          metadata: Json
          occurred_at: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_hash?: string | null
          before_hash?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_mock?: boolean
          metadata?: Json
          occurred_at?: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_hash?: string | null
          before_hash?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_mock?: boolean
          metadata?: Json
          occurred_at?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          after_state: Json | null
          before_state: Json | null
          id: string
          occurred_at: string
          reason: string
          reauth_verified_at: string | null
          resource_code: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: string
          after_state?: Json | null
          before_state?: Json | null
          id?: string
          occurred_at?: string
          reason: string
          reauth_verified_at?: string | null
          resource_code?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          after_state?: Json | null
          before_state?: Json | null
          id?: string
          occurred_at?: string
          reason?: string
          reauth_verified_at?: string | null
          resource_code?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      ai_generation_runs: {
        Row: {
          attempts: number
          business_id: string
          completed_at: string | null
          cost_micros: number
          created_at: string
          failure_kind: string | null
          fallback_reason: string | null
          growth_contract_id: string | null
          id: string
          idempotency_key: string | null
          input_hash: string
          is_mock: boolean
          latency_ms: number
          model: string
          output: Json | null
          prompt_version: string
          provider: string
          purpose: string
          safety_evidence: Json
          schema_version: string
          source: string
          status: string
          token_usage: Json
        }
        Insert: {
          attempts?: number
          business_id: string
          completed_at?: string | null
          cost_micros?: number
          created_at?: string
          failure_kind?: string | null
          fallback_reason?: string | null
          growth_contract_id?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash: string
          is_mock?: boolean
          latency_ms?: number
          model: string
          output?: Json | null
          prompt_version: string
          provider?: string
          purpose: string
          safety_evidence?: Json
          schema_version?: string
          source?: string
          status: string
          token_usage?: Json
        }
        Update: {
          attempts?: number
          business_id?: string
          completed_at?: string | null
          cost_micros?: number
          created_at?: string
          failure_kind?: string | null
          fallback_reason?: string | null
          growth_contract_id?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash?: string
          is_mock?: boolean
          latency_ms?: number
          model?: string
          output?: Json | null
          prompt_version?: string
          provider?: string
          purpose?: string
          safety_evidence?: Json
          schema_version?: string
          source?: string
          status?: string
          token_usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_runs_growth_contract_id_fkey"
            columns: ["growth_contract_id"]
            isOneToOne: false
            referencedRelation: "growth_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_quota: {
        Row: {
          business_id: string
          cost_micros: number
          generations: number
          updated_at: string
          window_date: string
        }
        Insert: {
          business_id: string
          cost_micros?: number
          generations?: number
          updated_at?: string
          window_date: string
        }
        Update: {
          business_id?: string
          cost_micros?: number
          generations?: number
          updated_at?: string
          window_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_quota_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          attempt: number
          automation_id: string
          business_id: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          is_mock: boolean
          result: Json
          scheduled_at: string
          started_at: string | null
          status: string
          trigger_source: string
        }
        Insert: {
          attempt?: number
          automation_id: string
          business_id: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          is_mock?: boolean
          result?: Json
          scheduled_at: string
          started_at?: string | null
          status: string
          trigger_source?: string
        }
        Update: {
          attempt?: number
          automation_id?: string
          business_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          is_mock?: boolean
          result?: Json
          scheduled_at?: string
          started_at?: string | null
          status?: string
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          action_rules: Json
          approved_template_version: string | null
          automation_type: string
          business_id: string
          created_at: string
          created_by: string
          filters: Json
          guardrails: Json
          id: string
          is_mock: boolean
          last_idempotency_key: string | null
          last_run_at: string | null
          mode: string
          name: string
          next_run_at: string | null
          optimistic_version: number
          owner_id: string | null
          rule_version: number
          status: string
          trigger_rules: Json
          updated_at: string
        }
        Insert: {
          action_rules: Json
          approved_template_version?: string | null
          automation_type: string
          business_id: string
          created_at?: string
          created_by: string
          filters?: Json
          guardrails: Json
          id?: string
          is_mock?: boolean
          last_idempotency_key?: string | null
          last_run_at?: string | null
          mode?: string
          name: string
          next_run_at?: string | null
          optimistic_version?: number
          owner_id?: string | null
          rule_version?: number
          status?: string
          trigger_rules: Json
          updated_at?: string
        }
        Update: {
          action_rules?: Json
          approved_template_version?: string | null
          automation_type?: string
          business_id?: string
          created_at?: string
          created_by?: string
          filters?: Json
          guardrails?: Json
          id?: string
          is_mock?: boolean
          last_idempotency_key?: string | null
          last_run_at?: string | null
          mode?: string
          name?: string
          next_run_at?: string | null
          optimistic_version?: number
          owner_id?: string | null
          rule_version?: number
          status?: string
          trigger_rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          business_id: string
          event_type: string
          external_event_id: string
          id: string
          is_mock: boolean
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          business_id: string
          event_type: string
          external_event_id: string
          id?: string
          is_mock?: boolean
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          signature_verified?: boolean
        }
        Update: {
          business_id?: string
          event_type?: string
          external_event_id?: string
          id?: string
          is_mock?: boolean
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_memory: {
        Row: {
          banned_phrases: Json
          business_id: string
          created_at: string
          id: string
          is_mock: boolean
          locale: string
          source_evidence: Json
          updated_at: string
          voice_rules: Json
        }
        Insert: {
          banned_phrases?: Json
          business_id: string
          created_at?: string
          id?: string
          is_mock?: boolean
          locale: string
          source_evidence?: Json
          updated_at?: string
          voice_rules?: Json
        }
        Update: {
          banned_phrases?: Json
          business_id?: string
          created_at?: string
          id?: string
          is_mock?: boolean
          locale?: string
          source_evidence?: Json
          updated_at?: string
          voice_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brand_memory_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_channels: {
        Row: {
          adapter: string
          business_id: string
          channel_type: string
          connector_state: string
          created_at: string
          external_account_ref: string | null
          health_evidence: Json
          id: string
          is_mock: boolean
          last_error: string | null
          last_health_check_at: string | null
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          adapter?: string
          business_id: string
          channel_type: string
          connector_state?: string
          created_at?: string
          external_account_ref?: string | null
          health_evidence?: Json
          id?: string
          is_mock?: boolean
          last_error?: string | null
          last_health_check_at?: string | null
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          adapter?: string
          business_id?: string
          channel_type?: string
          connector_state?: string
          created_at?: string
          external_account_ref?: string | null
          health_evidence?: Json
          id?: string
          is_mock?: boolean
          last_error?: string | null
          last_health_check_at?: string | null
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_channels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_execution_state: {
        Row: {
          business_id: string
          daily_send_cap: number
          emergency_stop_reason: string | null
          emergency_stopped_at: string | null
          emergency_stopped_by: string | null
          quiet_hours_end: string
          quiet_hours_start: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_id: string
          daily_send_cap?: number
          emergency_stop_reason?: string | null
          emergency_stopped_at?: string | null
          emergency_stopped_by?: string | null
          quiet_hours_end?: string
          quiet_hours_start?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          daily_send_cap?: number
          emergency_stop_reason?: string | null
          emergency_stopped_at?: string | null
          emergency_stopped_by?: string | null
          quiet_hours_end?: string
          quiet_hours_start?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_execution_state_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_goals: {
        Row: {
          business_id: string
          code: string
          created_at: string
          currency: string | null
          id: string
          is_mock: boolean
          priority: number
          status: string
          target_date: string | null
          target_minor: number | null
          updated_at: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          currency?: string | null
          id?: string
          is_mock?: boolean
          priority?: number
          status?: string
          target_date?: string | null
          target_minor?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          currency?: string | null
          id?: string
          is_mock?: boolean
          priority?: number
          status?: string
          target_date?: string | null
          target_minor?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_goals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_limits: {
        Row: {
          approval_threshold_minor: number
          business_id: string
          created_at: string
          currency: string
          id: string
          is_mock: boolean
          max_campaigns_per_month: number
          max_contacts_per_month: number
          monthly_budget_minor: number
          updated_at: string
        }
        Insert: {
          approval_threshold_minor?: number
          business_id: string
          created_at?: string
          currency?: string
          id?: string
          is_mock?: boolean
          max_campaigns_per_month?: number
          max_contacts_per_month?: number
          monthly_budget_minor?: number
          updated_at?: string
        }
        Update: {
          approval_threshold_minor?: number
          business_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_mock?: boolean
          max_campaigns_per_month?: number
          max_contacts_per_month?: number
          monthly_budget_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_limits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_locations: {
        Row: {
          address_text: string | null
          business_id: string
          capacity: number | null
          city: string
          created_at: string
          district: string | null
          id: string
          is_active: boolean
          is_mock: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address_text?: string | null
          business_id: string
          capacity?: number | null
          city: string
          created_at?: string
          district?: string | null
          id?: string
          is_active?: boolean
          is_mock?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_text?: string | null
          business_id?: string
          capacity?: number | null
          city?: string
          created_at?: string
          district?: string | null
          id?: string
          is_active?: boolean
          is_mock?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          invited_by: string | null
          is_mock: boolean
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          is_mock?: boolean
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          is_mock?: boolean
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          average_check_minor: number | null
          business_id: string
          created_at: string
          currency: string
          id: string
          is_mock: boolean
          margin_floor_bps: number
          monthly_marketing_budget_minor: number | null
          profile_confidence: number | null
          source_evidence: Json
          updated_at: string
        }
        Insert: {
          average_check_minor?: number | null
          business_id: string
          created_at?: string
          currency?: string
          id?: string
          is_mock?: boolean
          margin_floor_bps?: number
          monthly_marketing_budget_minor?: number | null
          profile_confidence?: number | null
          source_evidence?: Json
          updated_at?: string
        }
        Update: {
          average_check_minor?: number | null
          business_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_mock?: boolean
          margin_floor_bps?: number
          monthly_marketing_budget_minor?: number | null
          profile_confidence?: number | null
          source_evidence?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_tools: {
        Row: {
          activated_by: string
          business_id: string
          created_at: string
          id: string
          is_mock: boolean
          status: string
          tool_id: string
          updated_at: string
        }
        Insert: {
          activated_by: string
          business_id: string
          created_at?: string
          id?: string
          is_mock?: boolean
          status?: string
          tool_id: string
          updated_at?: string
        }
        Update: {
          activated_by?: string
          business_id?: string
          created_at?: string
          id?: string
          is_mock?: boolean
          status?: string
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_tools_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      business_types: {
        Row: {
          code: string
          created_at: string
          deprecated_at: string | null
          id: string
          is_mock: boolean
          is_public: boolean
          name_kk: string
          name_ru: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          is_mock?: boolean
          is_public?: boolean
          name_kk: string
          name_ru: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          is_mock?: boolean
          is_public?: boolean
          name_kk?: string
          name_ru?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          business_type_id: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          is_mock: boolean
          legal_name: string | null
          mode: string
          name: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_type_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          is_mock?: boolean
          legal_name?: string | null
          mode?: string
          name: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_type_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          is_mock?: boolean
          legal_name?: string | null
          mode?: string
          name?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_business_type_id_fkey"
            columns: ["business_type_id"]
            isOneToOne: false
            referencedRelation: "business_types"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_audiences: {
        Row: {
          business_id: string
          campaign_id: string
          consent_scope: string | null
          consent_status: string | null
          customer_id: string | null
          evaluated_at: string
          exclusion_reason: string | null
          id: string
          inclusion_status: string
          is_mock: boolean
          rules_evidence: Json
          segment_id: string | null
        }
        Insert: {
          business_id: string
          campaign_id: string
          consent_scope?: string | null
          consent_status?: string | null
          customer_id?: string | null
          evaluated_at?: string
          exclusion_reason?: string | null
          id?: string
          inclusion_status: string
          is_mock?: boolean
          rules_evidence?: Json
          segment_id?: string | null
        }
        Update: {
          business_id?: string
          campaign_id?: string
          consent_scope?: string | null
          consent_status?: string | null
          customer_id?: string | null
          evaluated_at?: string
          exclusion_reason?: string | null
          id?: string
          inclusion_status?: string
          is_mock?: boolean
          rules_evidence?: Json
          segment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_audiences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_audiences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_audiences_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_audiences_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliveries: {
        Row: {
          business_id: string
          campaign_id: string
          content_item_id: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          failure_code: string | null
          id: string
          idempotency_key: string
          is_mock: boolean
          provider_message_ref: string | null
          queued_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          business_id: string
          campaign_id: string
          content_item_id?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          failure_code?: string | null
          id?: string
          idempotency_key: string
          is_mock?: boolean
          provider_message_ref?: string | null
          queued_at?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          campaign_id?: string
          content_item_id?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          is_mock?: boolean
          provider_message_ref?: string | null
          queued_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliveries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliveries_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_drafts: {
        Row: {
          business_id: string
          created_at: string
          current_step: number
          draft: Json
          growth_contract_id: string | null
          id: string
          is_mock: boolean
          optimistic_version: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_step?: number
          draft?: Json
          growth_contract_id?: string | null
          id?: string
          is_mock?: boolean
          optimistic_version?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_step?: number
          draft?: Json
          growth_contract_id?: string | null
          id?: string
          is_mock?: boolean
          optimistic_version?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_drafts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_drafts_growth_contract_id_fkey"
            columns: ["growth_contract_id"]
            isOneToOne: false
            referencedRelation: "growth_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          business_id: string
          campaign_id: string
          created_at: string
          customer_id: string | null
          delivery_id: string | null
          event_type: string
          external_event_ref: string | null
          id: string
          is_mock: boolean
          metadata: Json
          occurred_at: string
          source: string
        }
        Insert: {
          business_id: string
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          delivery_id?: string | null
          event_type: string
          external_event_ref?: string | null
          id?: string
          is_mock?: boolean
          metadata?: Json
          occurred_at: string
          source: string
        }
        Update: {
          business_id?: string
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          delivery_id?: string | null
          event_type?: string
          external_event_ref?: string | null
          id?: string
          is_mock?: boolean
          metadata?: Json
          occurred_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          approved_by: string | null
          budget_minor: number
          business_id: string
          channel: string
          created_at: string
          created_by: string
          currency: string
          ends_at: string | null
          growth_contract_id: string
          id: string
          idempotency_key: string | null
          is_mock: boolean
          name: string
          optimistic_version: number
          starts_at: string | null
          status: string
          stop_rule: Json
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          budget_minor?: number
          business_id: string
          channel: string
          created_at?: string
          created_by: string
          currency?: string
          ends_at?: string | null
          growth_contract_id: string
          id?: string
          idempotency_key?: string | null
          is_mock?: boolean
          name: string
          optimistic_version?: number
          starts_at?: string | null
          status?: string
          stop_rule: Json
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          budget_minor?: number
          business_id?: string
          channel?: string
          created_at?: string
          created_by?: string
          currency?: string
          ends_at?: string | null
          growth_contract_id?: string
          id?: string
          idempotency_key?: string | null
          is_mock?: boolean
          name?: string
          optimistic_version?: number
          starts_at?: string | null
          status?: string
          stop_rule?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_growth_contract_id_fkey"
            columns: ["growth_contract_id"]
            isOneToOne: false
            referencedRelation: "growth_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_slots: {
        Row: {
          booked: number
          business_id: string
          capacity: number
          created_at: string
          ends_at: string
          id: string
          is_mock: boolean
          location_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          booked?: number
          business_id: string
          capacity: number
          created_at?: string
          ends_at: string
          id?: string
          is_mock?: boolean
          location_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          booked?: number
          business_id?: string
          capacity?: number
          created_at?: string
          ends_at?: string
          id?: string
          is_mock?: boolean
          location_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_slots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_slots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          business_id: string
          cost_minor: number | null
          created_at: string
          currency: string
          id: string
          is_active: boolean
          is_mock: boolean
          item_kind: string
          location_id: string | null
          name_kk: string | null
          name_ru: string
          price_minor: number
          sku: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_minor?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_mock?: boolean
          item_kind: string
          location_id?: string | null
          name_kk?: string | null
          name_ru: string
          price_minor: number
          sku?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_minor?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_mock?: boolean
          item_kind?: string
          location_id?: string | null
          name_kk?: string | null
          name_ru?: string
          price_minor?: number
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          alt_text: string | null
          body: string
          business_id: string
          campaign_id: string | null
          channel: string
          content_kind: string
          created_at: string
          cta: string | null
          generation_run_id: string | null
          id: string
          is_mock: boolean
          locale: string
          ordinal: number
          source: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          alt_text?: string | null
          body: string
          business_id: string
          campaign_id?: string | null
          channel: string
          content_kind: string
          created_at?: string
          cta?: string | null
          generation_run_id?: string | null
          id?: string
          is_mock?: boolean
          locale: string
          ordinal?: number
          source?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          alt_text?: string | null
          body?: string
          business_id?: string
          campaign_id?: string | null
          channel?: string
          content_kind?: string
          created_at?: string
          cta?: string | null
          generation_run_id?: string | null
          id?: string
          is_mock?: boolean
          locale?: string
          ordinal?: number
          source?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_generation_run_id_fkey"
            columns: ["generation_run_id"]
            isOneToOne: false
            referencedRelation: "ai_generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_refresh_state: {
        Row: {
          business_id: string
          interval_hours: number
          is_mock: boolean
          last_asset_count: number
          last_refreshed_at: string | null
          last_source: string | null
          next_refresh_at: string
          updated_at: string
        }
        Insert: {
          business_id: string
          interval_hours?: number
          is_mock?: boolean
          last_asset_count?: number
          last_refreshed_at?: string | null
          last_source?: string | null
          next_refresh_at?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          interval_hours?: number
          is_mock?: boolean
          last_asset_count?: number
          last_refreshed_at?: string | null
          last_source?: string | null
          next_refresh_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_refresh_state_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          evidence: Json
          expires_at: string | null
          granted_at: string | null
          id: string
          is_mock: boolean
          revoked_at: string | null
          scope: string
          source: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          evidence?: Json
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          is_mock?: boolean
          revoked_at?: string | null
          scope: string
          source: string
          status: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          evidence?: Json
          expires_at?: string | null
          granted_at?: string | null
          id?: string
          is_mock?: boolean
          revoked_at?: string | null
          scope?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_identities: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          id: string
          identity_type: string
          is_mock: boolean
          is_primary: boolean
          lookup_hash: string
          masked_value: string
          verified_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          id?: string
          identity_type: string
          is_mock?: boolean
          is_primary?: boolean
          lookup_hash: string
          masked_value: string
          verified_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          identity_type?: string
          is_mock?: boolean
          is_primary?: boolean
          lookup_hash?: string
          masked_value?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_identities_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_identities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_interactions: {
        Row: {
          body: string
          business_id: string
          channel: string
          created_at: string
          customer_id: string | null
          direction: string
          id: string
          is_mock: boolean
          kind: string
          metadata: Json
          occurred_at: string
        }
        Insert: {
          body: string
          business_id: string
          channel: string
          created_at?: string
          customer_id?: string | null
          direction: string
          id?: string
          is_mock?: boolean
          kind: string
          metadata?: Json
          occurred_at?: string
        }
        Update: {
          body?: string
          business_id?: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          is_mock?: boolean
          kind?: string
          metadata?: Json
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_interactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          author_id: string
          business_id: string
          created_at: string
          customer_id: string
          id: string
          is_mock: boolean
          note: string
          updated_at: string
        }
        Insert: {
          author_id: string
          business_id: string
          created_at?: string
          customer_id: string
          id?: string
          is_mock?: boolean
          note: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          business_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_mock?: boolean
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          business_id: string
          code: string
          created_at: string
          definition: Json
          id: string
          is_dynamic: boolean
          is_mock: boolean
          last_evaluated_at: string | null
          name_kk: string
          name_ru: string
          rule_version: number
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          definition: Json
          id?: string
          is_dynamic?: boolean
          is_mock?: boolean
          last_evaluated_at?: string | null
          name_kk: string
          name_ru: string
          rule_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          definition?: Json
          id?: string
          is_dynamic?: boolean
          is_mock?: boolean
          last_evaluated_at?: string | null
          name_kk?: string
          name_ru?: string
          rule_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_segments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          anonymized_at: string | null
          business_id: string
          created_at: string
          display_name: string | null
          first_seen_at: string | null
          id: string
          is_mock: boolean
          last_seen_at: string | null
          lifecycle_stage: string
          preferred_locale: string | null
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          business_id: string
          created_at?: string
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          is_mock?: boolean
          last_seen_at?: string | null
          lifecycle_stage?: string
          preferred_locale?: string | null
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          business_id?: string
          created_at?: string
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          is_mock?: boolean
          last_seen_at?: string | null
          lifecycle_stage?: string
          preferred_locale?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_analytics: {
        Row: {
          business_id: string
          created_at: string
          currency: string
          gross_revenue_minor: number
          id: string
          is_mock: boolean
          location_id: string | null
          metric_date: string
          new_customers_count: number
          repeat_customers_count: number
          source: string
          transactions_count: number
        }
        Insert: {
          business_id: string
          created_at?: string
          currency?: string
          gross_revenue_minor?: number
          id?: string
          is_mock?: boolean
          location_id?: string | null
          metric_date: string
          new_customers_count?: number
          repeat_customers_count?: number
          source: string
          transactions_count?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          currency?: string
          gross_revenue_minor?: number
          id?: string
          is_mock?: boolean
          location_id?: string | null
          metric_date?: string
          new_customers_count?: number
          repeat_customers_count?: number
          source?: string
          transactions_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_analytics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_analytics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_errors: {
        Row: {
          business_id: string
          code: string
          created_at: string
          data_import_id: string
          details: Json
          id: string
          is_mock: boolean
          message: string
          row_number: number | null
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          data_import_id: string
          details?: Json
          id?: string
          is_mock?: boolean
          message: string
          row_number?: number | null
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          data_import_id?: string
          details?: Json
          id?: string
          is_mock?: boolean
          message?: string
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_import_errors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_errors_data_import_id_fkey"
            columns: ["data_import_id"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      data_imports: {
        Row: {
          business_id: string
          checksum: string | null
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          is_mock: boolean
          rows_processed: number
          rows_total: number
          source_type: string
          started_at: string | null
          status: string
          storage_path: string | null
          summary: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_mock?: boolean
          rows_processed?: number
          rows_total?: number
          source_type: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          summary?: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_mock?: boolean
          rows_processed?: number
          rows_total?: number
          source_type?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_imports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      data_inventory: {
        Row: {
          classification: string
          column_name: string
          contains_pii: boolean
          lawful_basis: string
          notes: string | null
          storage_form: string
          table_name: string
        }
        Insert: {
          classification: string
          column_name: string
          contains_pii: boolean
          lawful_basis: string
          notes?: string | null
          storage_form: string
          table_name: string
        }
        Update: {
          classification?: string
          column_name?: string
          contains_pii?: boolean
          lawful_basis?: string
          notes?: string | null
          storage_form?: string
          table_name?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          created_at: string
          description: string
          id: string
          is_mock: boolean
          key: string
          value_kind: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_mock?: boolean
          key: string
          value_kind: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_mock?: boolean
          key?: string
          value_kind?: string
        }
        Relationships: []
      }
      favorite_tools: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_mock: boolean
          tool_id: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_mock?: boolean
          tool_id: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_mock?: boolean
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_tools_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          business_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          is_mock: boolean
          key: string
          updated_at: string
        }
        Insert: {
          business_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          is_mock?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          is_mock?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_runs: {
        Row: {
          assumptions: Json
          base: Json
          business_id: string
          cannibalization_risk_bps: number
          created_at: string
          explanations: Json
          formula_version: string
          growth_contract_id: string
          id: string
          is_mock: boolean
          margin_floor_bps: number
          optimistic: Json
          passed_margin_shield: boolean
          pessimistic: Json
        }
        Insert: {
          assumptions: Json
          base: Json
          business_id: string
          cannibalization_risk_bps: number
          created_at?: string
          explanations?: Json
          formula_version: string
          growth_contract_id: string
          id?: string
          is_mock?: boolean
          margin_floor_bps: number
          optimistic: Json
          passed_margin_shield: boolean
          pessimistic: Json
        }
        Update: {
          assumptions?: Json
          base?: Json
          business_id?: string
          cannibalization_risk_bps?: number
          created_at?: string
          explanations?: Json
          formula_version?: string
          growth_contract_id?: string
          id?: string
          is_mock?: boolean
          margin_floor_bps?: number
          optimistic?: Json
          passed_margin_shield?: boolean
          pessimistic?: Json
        }
        Relationships: [
          {
            foreignKeyName: "forecast_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_runs_growth_contract_id_fkey"
            columns: ["growth_contract_id"]
            isOneToOne: false
            referencedRelation: "growth_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_contracts: {
        Row: {
          accepted_snapshot: Json
          approved_at: string | null
          approved_by: string | null
          attribution_plan: Json | null
          business_id: string
          compiled_at: string | null
          consent_summary: Json | null
          content_hash: string
          created_at: string
          created_by: string
          id: string
          is_mock: boolean
          last_idempotency_key: string | null
          margin_decision: Json | null
          optimistic_version: number
          owner_limits_snapshot: Json | null
          recommendation_id: string | null
          schema_version: number
          signal_id: string
          simulator_result: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_snapshot: Json
          approved_at?: string | null
          approved_by?: string | null
          attribution_plan?: Json | null
          business_id: string
          compiled_at?: string | null
          consent_summary?: Json | null
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          is_mock?: boolean
          last_idempotency_key?: string | null
          margin_decision?: Json | null
          optimistic_version?: number
          owner_limits_snapshot?: Json | null
          recommendation_id?: string | null
          schema_version: number
          signal_id: string
          simulator_result?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_snapshot?: Json
          approved_at?: string | null
          approved_by?: string | null
          attribution_plan?: Json | null
          business_id?: string
          compiled_at?: string | null
          consent_summary?: Json | null
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          is_mock?: boolean
          last_idempotency_key?: string | null
          margin_decision?: Json | null
          optimistic_version?: number
          owner_limits_snapshot?: Json | null
          recommendation_id?: string | null
          schema_version?: number
          signal_id?: string
          simulator_result?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "growth_contracts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_contracts_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_contracts_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_baselines: {
        Row: {
          audience_size: number
          baseline_orders: number
          baseline_period_end: string
          baseline_period_start: string
          baseline_revenue_minor: number
          business_id: string
          campaign_id: string
          evidence: Json
          id: string
          is_mock: boolean
          measurement_version: string
          method: string
          min_sample_size: number
          recorded_at: string
        }
        Insert: {
          audience_size: number
          baseline_orders: number
          baseline_period_end: string
          baseline_period_start: string
          baseline_revenue_minor: number
          business_id: string
          campaign_id: string
          evidence?: Json
          id?: string
          is_mock?: boolean
          measurement_version: string
          method: string
          min_sample_size?: number
          recorded_at?: string
        }
        Update: {
          audience_size?: number
          baseline_orders?: number
          baseline_period_end?: string
          baseline_period_start?: string
          baseline_revenue_minor?: number
          business_id?: string
          campaign_id?: string
          evidence?: Json
          id?: string
          is_mock?: boolean
          measurement_version?: string
          method?: string
          min_sample_size?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "impact_baselines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_baselines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_measurements: {
        Row: {
          business_id: string
          campaign_id: string | null
          confidence: number | null
          created_at: string
          currency: string | null
          evidence: Json
          growth_contract_id: string | null
          id: string
          is_mock: boolean
          kind: string
          method_version: string | null
          metric_key: string
          period_end: string
          period_start: string
          source: string
          unit: string
          value_minor: number
        }
        Insert: {
          business_id: string
          campaign_id?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          evidence?: Json
          growth_contract_id?: string | null
          id?: string
          is_mock?: boolean
          kind: string
          method_version?: string | null
          metric_key: string
          period_end: string
          period_start: string
          source: string
          unit: string
          value_minor: number
        }
        Update: {
          business_id?: string
          campaign_id?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string | null
          evidence?: Json
          growth_contract_id?: string | null
          id?: string
          is_mock?: boolean
          kind?: string
          method_version?: string | null
          metric_key?: string
          period_end?: string
          period_start?: string
          source?: string
          unit?: string
          value_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "impact_measurements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_measurements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_measurements_growth_contract_id_fkey"
            columns: ["growth_contract_id"]
            isOneToOne: false
            referencedRelation: "growth_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          id: string
          is_mock: boolean
          loyalty_program_id: string
          optimistic_version: number
          points_balance: number
          stamps_balance: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          id?: string
          is_mock?: boolean
          loyalty_program_id: string
          optimistic_version?: number
          points_balance?: number
          stamps_balance?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_mock?: boolean
          loyalty_program_id?: string
          optimistic_version?: number
          points_balance?: number
          stamps_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          business_id: string
          created_at: string
          entry_type: string
          id: string
          idempotency_key: string
          is_mock: boolean
          loyalty_account_id: string
          metadata: Json
          occurred_at: string
          points_delta: number
          source_id: string | null
          source_type: string
          stamps_delta: number
        }
        Insert: {
          business_id: string
          created_at?: string
          entry_type: string
          id?: string
          idempotency_key: string
          is_mock?: boolean
          loyalty_account_id: string
          metadata?: Json
          occurred_at?: string
          points_delta?: number
          source_id?: string | null
          source_type: string
          stamps_delta?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          entry_type?: string
          id?: string
          idempotency_key?: string
          is_mock?: boolean
          loyalty_account_id?: string
          metadata?: Json
          occurred_at?: string
          points_delta?: number
          source_id?: string | null
          source_type?: string
          stamps_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_mock: boolean
          name: string
          program_type: string
          rules: Json
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_mock?: boolean
          name: string
          program_type: string
          rules: Json
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_mock?: boolean
          name?: string
          program_type?: string
          rules?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_salary_snapshots: {
        Row: {
          area_name: string
          business_id: string
          currency: string
          fetched_at: string
          id: string
          is_mock: boolean
          median_minor: number | null
          p25_minor: number | null
          p75_minor: number | null
          role_query: string
          sample_size: number
          source: string
        }
        Insert: {
          area_name?: string
          business_id: string
          currency?: string
          fetched_at?: string
          id?: string
          is_mock?: boolean
          median_minor?: number | null
          p25_minor?: number | null
          p75_minor?: number | null
          role_query: string
          sample_size: number
          source?: string
        }
        Update: {
          area_name?: string
          business_id?: string
          currency?: string
          fetched_at?: string
          id?: string
          is_mock?: boolean
          median_minor?: number | null
          p25_minor?: number | null
          p75_minor?: number | null
          role_query?: string
          sample_size?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_salary_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      nearby_offer_events: {
        Row: {
          business_id: string
          coarse_district: string | null
          event_kind: string
          id: string
          is_mock: boolean
          nearby_offer_id: string
          occurred_at: string
          request_key: string
        }
        Insert: {
          business_id: string
          coarse_district?: string | null
          event_kind: string
          id?: string
          is_mock?: boolean
          nearby_offer_id: string
          occurred_at?: string
          request_key: string
        }
        Update: {
          business_id?: string
          coarse_district?: string | null
          event_kind?: string
          id?: string
          is_mock?: boolean
          nearby_offer_id?: string
          occurred_at?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "nearby_offer_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nearby_offer_events_nearby_offer_id_fkey"
            columns: ["nearby_offer_id"]
            isOneToOne: false
            referencedRelation: "nearby_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      nearby_offers: {
        Row: {
          budget_minor: number
          budget_spent_minor: number
          business_id: string
          campaign_id: string | null
          category: string
          created_at: string
          description_kk: string
          description_ru: string
          district: string
          expires_at: string | null
          id: string
          is_mock: boolean
          latitude_rounded: number | null
          location_id: string
          longitude_rounded: number | null
          public_slug: string | null
          published_at: string | null
          status: string
          terms_kk: string | null
          terms_ru: string | null
          title_kk: string
          title_ru: string
          tracking_code_id: string | null
          updated_at: string
        }
        Insert: {
          budget_minor?: number
          budget_spent_minor?: number
          business_id: string
          campaign_id?: string | null
          category?: string
          created_at?: string
          description_kk: string
          description_ru: string
          district: string
          expires_at?: string | null
          id?: string
          is_mock?: boolean
          latitude_rounded?: number | null
          location_id: string
          longitude_rounded?: number | null
          public_slug?: string | null
          published_at?: string | null
          status?: string
          terms_kk?: string | null
          terms_ru?: string | null
          title_kk: string
          title_ru: string
          tracking_code_id?: string | null
          updated_at?: string
        }
        Update: {
          budget_minor?: number
          budget_spent_minor?: number
          business_id?: string
          campaign_id?: string | null
          category?: string
          created_at?: string
          description_kk?: string
          description_ru?: string
          district?: string
          expires_at?: string | null
          id?: string
          is_mock?: boolean
          latitude_rounded?: number | null
          location_id?: string
          longitude_rounded?: number | null
          public_slug?: string | null
          published_at?: string | null
          status?: string
          terms_kk?: string | null
          terms_ru?: string | null
          title_kk?: string
          title_ru?: string
          tracking_code_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nearby_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nearby_offers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nearby_offers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nearby_offers_tracking_code_id_fkey"
            columns: ["tracking_code_id"]
            isOneToOne: false
            referencedRelation: "tracking_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          business_id: string
          category: string
          muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          category: string
          muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          category?: string
          muted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          business_id: string
          category: string
          created_at: string
          dismissed_at: string | null
          id: string
          is_mock: boolean
          notification_type: string
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          body: string
          business_id: string
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          is_mock?: boolean
          notification_type: string
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string
          business_id?: string
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          is_mock?: boolean
          notification_type?: string
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          current_step: number
          draft: Json
          id: string
          import_mode: string | null
          is_mock: boolean
          optimistic_version: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          draft?: Json
          id?: string
          import_mode?: string | null
          is_mock?: boolean
          optimistic_version?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          draft?: Json
          id?: string
          import_mode?: string | null
          is_mock?: boolean
          optimistic_version?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_hours: {
        Row: {
          business_id: string
          closes_at: string | null
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          is_mock: boolean
          location_id: string
          opens_at: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          closes_at?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          is_mock?: boolean
          location_id: string
          opens_at?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          closes_at?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          is_mock?: boolean
          location_id?: string
          opens_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          attempts_max: number
          available_at: string
          business_id: string
          created_at: string
          dead_lettered_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          is_mock: boolean
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          attempts_max?: number
          available_at?: string
          business_id: string
          created_at?: string
          dead_lettered_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          is_mock?: boolean
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          attempts_max?: number
          available_at?: string
          business_id?: string
          created_at?: string
          dead_lettered_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          is_mock?: boolean
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          created_at: string
          entitlement_id: string
          id: string
          is_mock: boolean
          plan_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          entitlement_id: string
          id?: string
          is_mock?: boolean
          plan_id: string
          value: Json
        }
        Update: {
          created_at?: string
          entitlement_id?: string
          id?: string
          is_mock?: boolean
          plan_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: string
          code: string
          created_at: string
          currency: string
          description_kk: string | null
          description_ru: string | null
          id: string
          is_mock: boolean
          is_public: boolean
          name: string
          price_minor: number
          status: string
          tier_order: number
          updated_at: string
        }
        Insert: {
          billing_period?: string
          code: string
          created_at?: string
          currency?: string
          description_kk?: string | null
          description_ru?: string | null
          id?: string
          is_mock?: boolean
          is_public?: boolean
          name: string
          price_minor?: number
          status?: string
          tier_order?: number
          updated_at?: string
        }
        Update: {
          billing_period?: string
          code?: string
          created_at?: string
          currency?: string
          description_kk?: string | null
          description_ru?: string | null
          id?: string
          is_mock?: boolean
          is_public?: boolean
          name?: string
          price_minor?: number
          status?: string
          tier_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_events: {
        Row: {
          actor_id: string | null
          business_id: string | null
          created_at: string
          event_type: string
          id: string
          is_mock: boolean
          occurred_at: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          is_mock?: boolean
          occurred_at?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          is_mock?: boolean
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_requests: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          customer_id: string
          export_downloaded_at: string | null
          export_expires_at: string | null
          export_token_hash: string | null
          id: string
          idempotency_key: string
          is_mock: boolean
          request_type: string
          requested_at: string
          requester_hash: string
          result_summary: Json
          status: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          export_downloaded_at?: string | null
          export_expires_at?: string | null
          export_token_hash?: string | null
          id?: string
          idempotency_key: string
          is_mock?: boolean
          request_type: string
          requested_at?: string
          requester_hash: string
          result_summary?: Json
          status?: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          export_downloaded_at?: string | null
          export_expires_at?: string | null
          export_token_hash?: string | null
          id?: string
          idempotency_key?: string
          is_mock?: boolean
          request_type?: string
          requested_at?: string
          requester_hash?: string
          result_summary?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_mock: boolean
          preferred_locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_mock?: boolean
          preferred_locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_mock?: boolean
          preferred_locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          business_id: string
          campaign_id: string
          created_at: string
          currency: string
          estimated_unit_cost_minor: number | null
          id: string
          is_mock: boolean
          mechanism: string
          min_order_minor: number | null
          rules: Json
          updated_at: string
        }
        Insert: {
          business_id: string
          campaign_id: string
          created_at?: string
          currency?: string
          estimated_unit_cost_minor?: number | null
          id?: string
          is_mock?: boolean
          mechanism: string
          min_order_minor?: number | null
          rules: Json
          updated_at?: string
        }
        Update: {
          business_id?: string
          campaign_id?: string
          created_at?: string
          currency?: string
          estimated_unit_cost_minor?: number | null
          id?: string
          is_mock?: boolean
          mechanism?: string
          min_order_minor?: number | null
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_events: {
        Row: {
          business_id: string
          campaign_id: string | null
          channel: string
          delivery_id: string | null
          event_type: string
          external_event_id: string
          id: string
          is_mock: boolean
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          business_id: string
          campaign_id?: string | null
          channel: string
          delivery_id?: string | null
          event_type: string
          external_event_id: string
          id?: string
          is_mock?: boolean
          payload: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          signature_verified?: boolean
        }
        Update: {
          business_id?: string
          campaign_id?: string | null
          channel?: string
          delivery_id?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          is_mock?: boolean
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "provider_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_codes: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_mock: boolean
          location_id: string | null
          loyalty_program_id: string | null
          public_context: Json
          purpose: string
          revoked_at: string | null
          rotated_from_id: string | null
          status: string
          token_hash: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_mock?: boolean
          location_id?: string | null
          loyalty_program_id?: string | null
          public_context?: Json
          purpose: string
          revoked_at?: string | null
          rotated_from_id?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_mock?: boolean
          location_id?: string | null
          loyalty_program_id?: string | null
          public_context?: Json
          purpose?: string
          revoked_at?: string | null
          rotated_from_id?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_rotated_from_id_fkey"
            columns: ["rotated_from_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scans: {
        Row: {
          business_id: string
          coarse_location: Json
          created_at: string
          customer_id: string | null
          id: string
          ip_hash: string | null
          is_mock: boolean
          qr_code_id: string
          request_key: string | null
          scan_kind: string
          scanned_at: string
          user_agent_hash: string | null
        }
        Insert: {
          business_id: string
          coarse_location?: Json
          created_at?: string
          customer_id?: string | null
          id?: string
          ip_hash?: string | null
          is_mock?: boolean
          qr_code_id: string
          request_key?: string | null
          scan_kind?: string
          scanned_at?: string
          user_agent_hash?: string | null
        }
        Update: {
          business_id?: string
          coarse_location?: Json
          created_at?: string
          customer_id?: string | null
          id?: string
          ip_hash?: string | null
          is_mock?: boolean
          qr_code_id?: string
          request_key?: string | null
          scan_kind?: string
          scanned_at?: string
          user_agent_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scans_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          business_id: string
          confidence: number
          created_at: string
          explanation: Json
          feedback: Json
          id: string
          is_mock: boolean
          last_idempotency_key: string | null
          optimistic_version: number
          origin_key: string | null
          signal_id: string | null
          snoozed_until: string | null
          status: string
          title_kk: string
          title_ru: string
          updated_at: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          business_id: string
          confidence: number
          created_at?: string
          explanation: Json
          feedback?: Json
          id?: string
          is_mock?: boolean
          last_idempotency_key?: string | null
          optimistic_version?: number
          origin_key?: string | null
          signal_id?: string | null
          snoozed_until?: string | null
          status?: string
          title_kk: string
          title_ru: string
          updated_at?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          business_id?: string
          confidence?: number
          created_at?: string
          explanation?: Json
          feedback?: Json
          id?: string
          is_mock?: boolean
          last_idempotency_key?: string | null
          optimistic_version?: number
          origin_key?: string | null
          signal_id?: string | null
          snoozed_until?: string | null
          status?: string
          title_kk?: string
          title_ru?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          business_id: string
          campaign_cost_minor: number
          campaign_id: string
          created_at: string
          currency: string
          customer_id: string | null
          id: string
          is_mock: boolean
          order_total_minor: number
          promotion_id: string | null
          redeemed_at: string
          tracking_code_id: string | null
          transaction_id: string | null
        }
        Insert: {
          business_id: string
          campaign_cost_minor?: number
          campaign_id: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          is_mock?: boolean
          order_total_minor: number
          promotion_id?: string | null
          redeemed_at: string
          tracking_code_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          business_id?: string
          campaign_cost_minor?: number
          campaign_id?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          is_mock?: boolean
          order_total_minor?: number
          promotion_id?: string | null
          redeemed_at?: string
          tracking_code_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_tracking_code_id_fkey"
            columns: ["tracking_code_id"]
            isOneToOne: false
            referencedRelation: "tracking_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          anonymize_instead_of_delete: boolean
          category: string
          contains_pii: boolean
          lawful_basis: string
          notes: string | null
          record_type: string
          retain_days: number | null
        }
        Insert: {
          anonymize_instead_of_delete?: boolean
          category: string
          contains_pii: boolean
          lawful_basis: string
          notes?: string | null
          record_type: string
          retain_days?: number | null
        }
        Update: {
          anonymize_instead_of_delete?: boolean
          category?: string
          contains_pii?: boolean
          lawful_basis?: string
          notes?: string | null
          record_type?: string
          retain_days?: number | null
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          business_id: string
          customer_id: string
          id: string
          idempotency_key: string | null
          is_mock: boolean
          issued_at: string
          loyalty_ledger_id: string
          redeemed_at: string | null
          reward_id: string
          status: string
        }
        Insert: {
          business_id: string
          customer_id: string
          id?: string
          idempotency_key?: string | null
          is_mock?: boolean
          issued_at?: string
          loyalty_ledger_id: string
          redeemed_at?: string | null
          reward_id: string
          status?: string
        }
        Update: {
          business_id?: string
          customer_id?: string
          id?: string
          idempotency_key?: string | null
          is_mock?: boolean
          issued_at?: string
          loyalty_ledger_id?: string
          redeemed_at?: string | null
          reward_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_loyalty_ledger_id_fkey"
            columns: ["loyalty_ledger_id"]
            isOneToOne: true
            referencedRelation: "loyalty_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          business_id: string
          cost_points: number | null
          cost_stamps: number | null
          created_at: string
          id: string
          inventory_limit: number | null
          is_mock: boolean
          loyalty_program_id: string | null
          name_kk: string
          name_ru: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_points?: number | null
          cost_stamps?: number | null
          created_at?: string
          id?: string
          inventory_limit?: number | null
          is_mock?: boolean
          loyalty_program_id?: string | null
          name_kk: string
          name_ru: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_points?: number | null
          cost_stamps?: number | null
          created_at?: string
          id?: string
          inventory_limit?: number | null
          is_mock?: boolean
          loyalty_program_id?: string | null
          name_kk?: string
          name_ru?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_memberships: {
        Row: {
          business_id: string
          customer_id: string
          evaluated_at: string
          id: string
          is_mock: boolean
          reason: Json
          segment_id: string
        }
        Insert: {
          business_id: string
          customer_id: string
          evaluated_at?: string
          id?: string
          is_mock?: boolean
          reason?: Json
          segment_id: string
        }
        Update: {
          business_id?: string
          customer_id?: string
          evaluated_at?: string
          id?: string
          is_mock?: boolean
          reason?: Json
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_memberships_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          assumptions: Json
          baseline: Json
          business_id: string
          change_bps: number
          comparison_end: string
          comparison_start: string
          confidence: number
          created_at: string
          delta: Json
          detected_at: string
          evidence: Json
          formula_version: string
          growth_opportunity_score: number
          id: string
          is_mock: boolean
          location_id: string | null
          metric_key: string
          period_end: string
          period_start: string
          signal_type: string
          status: string
          updated_at: string
        }
        Insert: {
          assumptions?: Json
          baseline?: Json
          business_id: string
          change_bps: number
          comparison_end: string
          comparison_start: string
          confidence: number
          created_at?: string
          delta?: Json
          detected_at?: string
          evidence: Json
          formula_version?: string
          growth_opportunity_score: number
          id?: string
          is_mock?: boolean
          location_id?: string | null
          metric_key: string
          period_end: string
          period_start: string
          signal_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          assumptions?: Json
          baseline?: Json
          business_id?: string
          change_bps?: number
          comparison_end?: string
          comparison_start?: string
          confidence?: number
          created_at?: string
          delta?: Json
          detected_at?: string
          evidence?: Json
          formula_version?: string
          growth_opportunity_score?: number
          id?: string
          is_mock?: boolean
          location_id?: string | null
          metric_key?: string
          period_end?: string
          period_start?: string
          signal_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      source_connections: {
        Row: {
          business_id: string
          connection_kind: string
          created_at: string
          credential_reference: string | null
          external_account_ref: string | null
          id: string
          is_mock: boolean
          last_synced_at: string | null
          provider: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          connection_kind: string
          created_at?: string
          credential_reference?: string | null
          external_account_ref?: string | null
          id?: string
          is_mock?: boolean
          last_synced_at?: string | null
          provider: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          connection_kind?: string
          created_at?: string
          credential_reference?: string | null
          external_account_ref?: string | null
          id?: string
          is_mock?: boolean
          last_synced_at?: string | null
          provider?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          cancel_at: string | null
          created_at: string
          grace_period_ends_at: string | null
          id: string
          is_mock: boolean
          last_provider_event_id: string | null
          period_end: string
          period_start: string
          plan_id: string
          provider: string
          provider_subscription_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at?: string | null
          created_at?: string
          grace_period_ends_at?: string | null
          id?: string
          is_mock?: boolean
          last_provider_event_id?: string | null
          period_end: string
          period_start: string
          plan_id: string
          provider?: string
          provider_subscription_ref?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at?: string | null
          created_at?: string
          grace_period_ends_at?: string | null
          id?: string
          is_mock?: boolean
          last_provider_event_id?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string
          provider?: string
          provider_subscription_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_items: {
        Row: {
          business_id: string
          created_at: string
          current_price_minor: number | null
          current_supplier: string | null
          id: string
          is_mock: boolean
          monthly_quantity: number | null
          name_ru: string
          needed: boolean
          notes: string | null
          search_query: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_price_minor?: number | null
          current_supplier?: string | null
          id?: string
          is_mock?: boolean
          monthly_quantity?: number | null
          name_ru: string
          needed?: boolean
          notes?: string | null
          search_query?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_price_minor?: number | null
          current_supplier?: string | null
          id?: string
          is_mock?: boolean
          monthly_quantity?: number | null
          name_ru?: string
          needed?: boolean
          notes?: string | null
          search_query?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_offers: {
        Row: {
          business_id: string
          created_at: string
          external_id: string | null
          found_at: string
          id: string
          is_mock: boolean
          pack_size: number
          price_minor: number
          source: string
          supplier: string
          supply_item_id: string
          url: string | null
          verified: boolean
        }
        Insert: {
          business_id: string
          created_at?: string
          external_id?: string | null
          found_at?: string
          id?: string
          is_mock?: boolean
          pack_size?: number
          price_minor: number
          source?: string
          supplier: string
          supply_item_id: string
          url?: string | null
          verified?: boolean
        }
        Update: {
          business_id?: string
          created_at?: string
          external_id?: string | null
          found_at?: string
          id?: string
          is_mock?: boolean
          pack_size?: number
          price_minor?: number
          source?: string
          supplier?: string
          supply_item_id?: string
          url?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "supply_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_offers_supply_item_id_fkey"
            columns: ["supply_item_id"]
            isOneToOne: false
            referencedRelation: "supply_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_search_runs: {
        Row: {
          business_id: string
          error: string | null
          http_status: number | null
          id: string
          is_mock: boolean
          offers_found: number
          query: string
          ran_at: string
          source: string
          status: string
          supply_item_id: string | null
        }
        Insert: {
          business_id: string
          error?: string | null
          http_status?: number | null
          id?: string
          is_mock?: boolean
          offers_found?: number
          query: string
          ran_at?: string
          source: string
          status: string
          supply_item_id?: string | null
        }
        Update: {
          business_id?: string
          error?: string | null
          http_status?: number | null
          id?: string
          is_mock?: boolean
          offers_found?: number
          query?: string
          ran_at?: string
          source?: string
          status?: string
          supply_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_search_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_search_runs_supply_item_id_fkey"
            columns: ["supply_item_id"]
            isOneToOne: false
            referencedRelation: "supply_items"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_entries: {
        Row: {
          business_id: string
          channel: string | null
          created_at: string
          customer_id: string | null
          id: string
          identity_hash: string | null
          is_mock: boolean
          reason: string
        }
        Insert: {
          business_id: string
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          identity_hash?: string | null
          is_mock?: boolean
          reason: string
        }
        Update: {
          business_id?: string
          channel?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          identity_hash?: string | null
          is_mock?: boolean
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_id: string
          created_at: string
          email_hash: string
          expires_at: string
          id: string
          invited_by: string
          is_mock: boolean
          masked_email: string
          revoked_at: string | null
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id: string
          created_at?: string
          email_hash: string
          expires_at: string
          id?: string
          invited_by: string
          is_mock?: boolean
          masked_email: string
          revoked_at?: string | null
          role: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id?: string
          created_at?: string
          email_hash?: string
          expires_at?: string
          id?: string
          invited_by?: string
          is_mock?: boolean
          masked_email?: string
          revoked_at?: string | null
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          archived_at: string | null
          compatible_business_types: string[]
          content: Json
          created_at: string
          created_by: string | null
          id: string
          is_mock: boolean
          locales: string[]
          migrates_from_version: number | null
          migration_notes: string | null
          published_at: string | null
          published_by: string | null
          schema_version: number
          status: string
          template_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          compatible_business_types?: string[]
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_mock?: boolean
          locales?: string[]
          migrates_from_version?: number | null
          migration_notes?: string | null
          published_at?: string | null
          published_by?: string | null
          schema_version: number
          status?: string
          template_id: string
          version: number
        }
        Update: {
          archived_at?: string | null
          compatible_business_types?: string[]
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_mock?: boolean
          locales?: string[]
          migrates_from_version?: number | null
          migration_notes?: string | null
          published_at?: string | null
          published_by?: string | null
          schema_version?: number
          status?: string
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          archived_at: string | null
          business_type_codes: string[]
          code: string
          created_at: string
          current_version: number | null
          id: string
          is_mock: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_type_codes?: string[]
          code: string
          created_at?: string
          current_version?: number | null
          id?: string
          is_mock?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_type_codes?: string[]
          code?: string
          created_at?: string
          current_version?: number | null
          id?: string
          is_mock?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_categories: {
        Row: {
          code: string
          created_at: string
          deprecated_at: string | null
          id: string
          is_mock: boolean
          name_kk: string
          name_ru: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          is_mock?: boolean
          name_kk: string
          name_ru: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          is_mock?: boolean
          name_kk?: string
          name_ru?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          archived_at: string | null
          category_id: string
          code: string
          compatible_business_types: string[]
          created_at: string
          description_kk: string
          description_ru: string
          id: string
          is_mock: boolean
          is_public: boolean
          name_kk: string
          name_ru: string
          route: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          category_id: string
          code: string
          compatible_business_types?: string[]
          created_at?: string
          description_kk: string
          description_ru: string
          id?: string
          is_mock?: boolean
          is_public?: boolean
          name_kk: string
          name_ru: string
          route: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          category_id?: string
          code?: string
          compatible_business_types?: string[]
          created_at?: string
          description_kk?: string
          description_ru?: string
          id?: string
          is_mock?: boolean
          is_public?: boolean
          name_kk?: string
          name_ru?: string
          route?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tools_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tool_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_codes: {
        Row: {
          business_id: string
          campaign_id: string
          code_hash: string
          content_item_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_mock: boolean
          public_code: string
          purpose: string
        }
        Insert: {
          business_id: string
          campaign_id: string
          code_hash: string
          content_item_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_mock?: boolean
          public_code: string
          purpose: string
        }
        Update: {
          business_id?: string
          campaign_id?: string
          code_hash?: string
          content_item_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_mock?: boolean
          public_code?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_codes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_codes_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          business_id: string
          catalog_item_id: string | null
          created_at: string
          currency: string
          id: string
          is_mock: boolean
          item_name: string
          quantity: number
          total_minor: number
          transaction_id: string
          unit_cost_minor: number | null
          unit_price_minor: number
        }
        Insert: {
          business_id: string
          catalog_item_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_mock?: boolean
          item_name: string
          quantity: number
          total_minor: number
          transaction_id: string
          unit_cost_minor?: number | null
          unit_price_minor: number
        }
        Update: {
          business_id?: string
          catalog_item_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_mock?: boolean
          item_name?: string
          quantity?: number
          total_minor?: number
          transaction_id?: string
          unit_cost_minor?: number | null
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          business_id: string
          cost_minor: number | null
          created_at: string
          currency: string
          customer_id: string | null
          discount_minor: number
          external_ref: string | null
          gross_minor: number
          id: string
          is_mock: boolean
          location_id: string | null
          net_minor: number
          occurred_at: string
          source: string
        }
        Insert: {
          business_id: string
          cost_minor?: number | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_minor?: number
          external_ref?: string | null
          gross_minor: number
          id?: string
          is_mock?: boolean
          location_id?: string | null
          net_minor: number
          occurred_at: string
          source?: string
        }
        Update: {
          business_id?: string
          cost_minor?: number | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_minor?: number
          external_ref?: string | null
          gross_minor?: number
          id?: string
          is_mock?: boolean
          location_id?: string | null
          net_minor?: number
          occurred_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          business_id: string
          created_at: string
          entitlement_key: string
          id: string
          is_mock: boolean
          period_end: string
          period_start: string
          updated_at: string
          used: number
        }
        Insert: {
          business_id: string
          created_at?: string
          entitlement_key: string
          id?: string
          is_mock?: boolean
          period_end: string
          period_start: string
          updated_at?: string
          used?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          entitlement_key?: string
          id?: string
          is_mock?: boolean
          period_end?: string
          period_start?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation: { Args: { p_token: string }; Returns: Json }
      admin_audit: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_reason: string
          p_resource_code: string
          p_resource_id: string
          p_resource_type: string
          p_sensitive?: boolean
        }
        Returns: string
      }
      anonymize_customer: {
        Args: { p_business_id: string; p_customer_id: string; p_reason: string }
        Returns: Json
      }
      assistant_context: {
        Args: { p_business_id: string; p_customer_id?: string }
        Returns: Json
      }
      business_for_admin_key: {
        Args: { p_key: string }
        Returns: {
          business_id: string
          business_name: string
        }[]
      }
      businesses_due_for_content: {
        Args: { p_limit?: number }
        Returns: {
          business_id: string
        }[]
      }
      claim_outbox_batch: {
        Args: { p_business_id: string; p_limit: number; p_worker: string }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          attempts_max: number
          available_at: string
          business_id: string
          created_at: string
          dead_lettered_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          is_mock: boolean
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          processed_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_telegram_link: {
        Args: { p_chat_id: string; p_code: string }
        Returns: Json
      }
      complete_onboarding: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_session_id: string
        }
        Returns: Json
      }
      consume_entitlement: {
        Args: {
          p_amount: number
          p_business_id: string
          p_key: string
          p_request_key: string
        }
        Returns: Json
      }
      create_loyalty_program: {
        Args: {
          p_business_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_location_id: string
          p_name: string
          p_program_type: string
          p_rewards: Json
          p_rules: Json
          p_token: string
        }
        Returns: Json
      }
      current_platform_role: { Args: never; Returns: string }
      customer_channels_for_address: {
        Args: { p_address: string; p_channel: string }
        Returns: {
          business_id: string
          business_name: string
          customer_id: string
        }[]
      }
      customer_for_channel_address: {
        Args: { p_address: string; p_channel: string }
        Returns: {
          business_id: string
          customer_id: string
        }[]
      }
      demo_time_jump: {
        Args: {
          p_business_id: string
          p_campaign_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      effective_consent_customers: {
        Args: {
          p_business_id: string
          p_customer_ids: string[]
          p_scope: string
        }
        Returns: string[]
      }
      enqueue_delivery: {
        Args: {
          p_business_id: string
          p_campaign_id: string
          p_channel: string
          p_content_item_id: string
          p_customer_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      evaluate_stop_loss: {
        Args: {
          p_campaign_id: string
          p_min_delivered: number
          p_min_redemption_bps: number
        }
        Returns: Json
      }
      execute_automation: {
        Args: {
          p_automation_id: string
          p_idempotency_key: string
          p_trigger_source: string
        }
        Returns: Json
      }
      expand_campaign_audience: {
        Args: { p_campaign_id: string; p_idempotency_key: string }
        Returns: Json
      }
      import_customers: {
        Args: {
          p_business_id: string
          p_duplicate_strategy: string
          p_idempotency_key: string
          p_rows: Json
        }
        Returns: Json
      }
      ingest_provider_event: {
        Args: {
          p_business_id: string
          p_channel: string
          p_delivery_id: string
          p_event_type: string
          p_external_event_id: string
          p_occurred_at: string
          p_payload: Json
          p_provider: string
          p_signature_verified: boolean
        }
        Returns: Json
      }
      invite_team_member: {
        Args: {
          p_business_id: string
          p_email: string
          p_expires_at: string
          p_role: string
          p_token: string
        }
        Returns: Json
      }
      is_current_platform_admin: { Args: never; Returns: boolean }
      issue_telegram_link: { Args: { p_business_id: string }; Returns: Json }
      launch_contract_from_chat: {
        Args: {
          p_channel: string
          p_chat_id: string
          p_contract_id: string
          p_name: string
        }
        Returns: Json
      }
      launch_growth_contract: {
        Args: {
          p_channel: string
          p_contract_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_name: string
        }
        Returns: Json
      }
      loyalty_card: {
        Args: { p_business_id: string; p_customer_id: string }
        Returns: Json
      }
      mark_admin_reauth: { Args: never; Returns: Json }
      mark_content_refreshed: {
        Args: { p_asset_count: number; p_business_id: string; p_source: string }
        Returns: string
      }
      my_admin_key: { Args: never; Returns: Json }
      owner_businesses_for_chat: {
        Args: { p_chat_id: string }
        Returns: {
          business_id: string
          business_name: string
        }[]
      }
      owner_chats: {
        Args: { p_business_id: string }
        Returns: {
          chat_id: string
        }[]
      }
      owner_console: { Args: { p_business_id: string }; Returns: Json }
      owner_digest: { Args: { p_business_id: string }; Returns: Json }
      platform_overview: {
        Args: {
          p_business_type: string
          p_city: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      preview_segment_audience: {
        Args: { p_business_id: string; p_rule: Json }
        Returns: Json
      }
      process_customer_privacy_request: {
        Args: {
          p_idempotency_key: string
          p_identity_type: string
          p_identity_value: string
          p_ip_key: string
          p_request_type: string
          p_token: string
        }
        Returns: Json
      }
      process_loyalty_join: {
        Args: {
          p_display_name: string
          p_idempotency_key: string
          p_identity_type: string
          p_identity_value: string
          p_ip_key: string
          p_loyalty_consent: boolean
          p_marketing_consent: boolean
          p_token: string
          p_verification_kind: string
        }
        Returns: Json
      }
      process_loyalty_redeem: {
        Args: {
          p_idempotency_key: string
          p_identity_type: string
          p_identity_value: string
          p_ip_key: string
          p_reward_id: string
          p_token: string
        }
        Returns: Json
      }
      publish_template_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: Json
      }
      recommend_from_signals: { Args: { p_business_id: string }; Returns: Json }
      recompute_campaign_impact: {
        Args: { p_campaign_id: string; p_measurement_version: string }
        Returns: Json
      }
      recompute_segment_memberships: {
        Args: {
          p_business_id: string
          p_idempotency_key: string
          p_members: Json
          p_rule_version: number
          p_segment_id: string
        }
        Returns: Json
      }
      record_ai_generation_run: {
        Args: {
          p_attempts: number
          p_business_id: string
          p_cost_micros: number
          p_failure_kind: string
          p_fallback_reason: string
          p_growth_contract_id: string
          p_idempotency_key: string
          p_input_hash: string
          p_latency_ms: number
          p_max_cost_micros_per_day: number
          p_max_generations_per_day: number
          p_model: string
          p_output: Json
          p_prompt_version: string
          p_provider: string
          p_purpose: string
          p_safety_evidence: Json
          p_schema_version: string
          p_source: string
          p_status: string
          p_token_usage: Json
        }
        Returns: Json
      }
      record_channel_consent: {
        Args: {
          p_business_id: string
          p_customer_id: string
          p_evidence?: Json
          p_granted: boolean
          p_scope: string
          p_source: string
        }
        Returns: Json
      }
      record_customer_interaction: {
        Args: {
          p_body: string
          p_business_id: string
          p_channel: string
          p_customer_id: string
          p_direction: string
          p_kind: string
          p_metadata?: Json
        }
        Returns: string
      }
      record_detected_signal: {
        Args: {
          p_assumptions: Json
          p_baseline: Json
          p_business_id: string
          p_change_bps: number
          p_comparison_end: string
          p_comparison_start: string
          p_confidence: number
          p_delta: Json
          p_evidence: Json
          p_metric_key: string
          p_period_end: string
          p_period_start: string
          p_signal_type: string
        }
        Returns: Json
      }
      redeem_reward_for_customer: {
        Args: {
          p_business_id: string
          p_customer_id: string
          p_idempotency_key: string
          p_reward_id: string
        }
        Returns: Json
      }
      refresh_my_recommendations: { Args: never; Returns: Json }
      remember_channel_address: {
        Args: {
          p_address: string
          p_business_id: string
          p_channel: string
          p_customer_id?: string
          p_owner_user_id?: string
        }
        Returns: Json
      }
      resolve_channel_address: {
        Args: {
          p_business_id: string
          p_channel: string
          p_customer_id: string
        }
        Returns: string
      }
      rollback_template: {
        Args: {
          p_reason: string
          p_target_version: number
          p_template_id: string
        }
        Returns: Json
      }
      rotate_qr_code: {
        Args: {
          p_business_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_loyalty_program_id: string
          p_qr_id: string
          p_token: string
        }
        Returns: Json
      }
      send_gate: {
        Args: {
          p_at?: string
          p_business_id: string
          p_channel: string
          p_customer_id: string
          p_exclude_delivery_id?: string
        }
        Returns: Json
      }
      set_emergency_stop: {
        Args: { p_business_id: string; p_reason: string; p_stop: boolean }
        Returns: Json
      }
      settle_outbox_event: {
        Args: { p_error: string; p_event_id: string; p_success: boolean }
        Returns: Json
      }
      supply_savings: { Args: { p_business_id: string }; Returns: Json }
      transfer_ownership: {
        Args: { p_business_id: string; p_to_user: string }
        Returns: Json
      }
      transition_domain_entity: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_expected_version: number
          p_idempotency_key: string
          p_to_status: string
        }
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

