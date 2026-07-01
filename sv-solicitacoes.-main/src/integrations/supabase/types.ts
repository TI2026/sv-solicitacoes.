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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admission_files: {
        Row: {
          admission_request_id: string
          candidate_id: string
          created_at: string
          file_type: string
          id: string
          link_type: string
          original_filename: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          admission_request_id: string
          candidate_id: string
          created_at?: string
          file_type?: string
          id?: string
          link_type: string
          original_filename?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          admission_request_id?: string
          candidate_id?: string
          created_at?: string
          file_type?: string
          id?: string
          link_type?: string
          original_filename?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_files_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "admission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_files_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_files_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_files_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
        ]
      }
      admission_interviews: {
        Row: {
          admission_request_id: string
          candidate_id: string
          conducted_by: string | null
          created_at: string
          id: string
          interview_address: string | null
          interview_city: string | null
          interview_mode: string | null
          meeting_link: string | null
          notes: string | null
          result: string | null
          scheduled_at: string
        }
        Insert: {
          admission_request_id: string
          candidate_id: string
          conducted_by?: string | null
          created_at?: string
          id?: string
          interview_address?: string | null
          interview_city?: string | null
          interview_mode?: string | null
          meeting_link?: string | null
          notes?: string | null
          result?: string | null
          scheduled_at: string
        }
        Update: {
          admission_request_id?: string
          candidate_id?: string
          conducted_by?: string | null
          created_at?: string
          id?: string
          interview_address?: string | null
          interview_city?: string | null
          interview_mode?: string | null
          meeting_link?: string | null
          notes?: string | null
          result?: string | null
          scheduled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_interviews_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "admission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_interviews_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
          {
            foreignKeyName: "admission_interviews_conducted_by_fkey"
            columns: ["conducted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_public_links: {
        Row: {
          admin_uploaded_at: string | null
          admission_request_id: string
          candidate_id: string
          candidate_uploaded_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          link_type: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          admin_uploaded_at?: string | null
          admission_request_id: string
          candidate_id: string
          candidate_uploaded_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          link_type: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          admin_uploaded_at?: string | null
          admission_request_id?: string
          candidate_id?: string
          candidate_uploaded_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          link_type?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_public_links_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "admission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_public_links_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_public_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_public_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
        ]
      }
      admission_requests: {
        Row: {
          cargo_funcao: string
          centro_custo: string
          contrato_publico_ref: string | null
          created_at: string
          data_prevista_inicio: string | null
          gestor_responsavel: string
          id: string
          jornada: string
          justificativa: string | null
          local_contratacao: string
          motivo: string
          pants_size: string | null
          priority: string
          requester_user_id: string
          salario_previsto: number | null
          shirt_size: string | null
          shoe_size: string | null
          status: Database["public"]["Enums"]["admission_status"]
          tipo_contrato: string
          uniform_sizes: Json | null
          updated_at: string
          welcome_local_apresentacao: string | null
          welcome_pdf_generated_at: string | null
          welcome_responsavel_contato: string | null
          welcome_responsavel_nome: string | null
        }
        Insert: {
          cargo_funcao?: string
          centro_custo?: string
          contrato_publico_ref?: string | null
          created_at?: string
          data_prevista_inicio?: string | null
          gestor_responsavel?: string
          id?: string
          jornada?: string
          justificativa?: string | null
          local_contratacao?: string
          motivo?: string
          pants_size?: string | null
          priority?: string
          requester_user_id: string
          salario_previsto?: number | null
          shirt_size?: string | null
          shoe_size?: string | null
          status?: Database["public"]["Enums"]["admission_status"]
          tipo_contrato?: string
          uniform_sizes?: Json | null
          updated_at?: string
          welcome_local_apresentacao?: string | null
          welcome_pdf_generated_at?: string | null
          welcome_responsavel_contato?: string | null
          welcome_responsavel_nome?: string | null
        }
        Update: {
          cargo_funcao?: string
          centro_custo?: string
          contrato_publico_ref?: string | null
          created_at?: string
          data_prevista_inicio?: string | null
          gestor_responsavel?: string
          id?: string
          jornada?: string
          justificativa?: string | null
          local_contratacao?: string
          motivo?: string
          pants_size?: string | null
          priority?: string
          requester_user_id?: string
          salario_previsto?: number | null
          shirt_size?: string | null
          shoe_size?: string | null
          status?: Database["public"]["Enums"]["admission_status"]
          tipo_contrato?: string
          uniform_sizes?: Json | null
          updated_at?: string
          welcome_local_apresentacao?: string | null
          welcome_pdf_generated_at?: string | null
          welcome_responsavel_contato?: string | null
          welcome_responsavel_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_flow_steps: {
        Row: {
          active: boolean
          approver_role_key: string | null
          approver_type: string
          approver_user_id: string | null
          created_at: string
          fixed_sector_id: string | null
          flow_id: string
          id: string
          is_required: boolean
          step_order: number
        }
        Insert: {
          active?: boolean
          approver_role_key?: string | null
          approver_type?: string
          approver_user_id?: string | null
          created_at?: string
          fixed_sector_id?: string | null
          flow_id: string
          id?: string
          is_required?: boolean
          step_order: number
        }
        Update: {
          active?: boolean
          approver_role_key?: string | null
          approver_type?: string
          approver_user_id?: string | null
          created_at?: string
          fixed_sector_id?: string | null
          flow_id?: string
          id?: string
          is_required?: boolean
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_flow_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flow_steps_fixed_sector_id_fkey"
            columns: ["fixed_sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_flows: {
        Row: {
          active: boolean
          allow_return_for_adjustment: boolean
          approval_type: string
          created_at: string
          created_by: string | null
          id: string
          module_id: string
          name: string
          notify_next_approver: boolean
          require_rejection_reason: boolean
          return_mode: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_return_for_adjustment?: boolean
          approval_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          module_id: string
          name: string
          notify_next_approver?: boolean
          require_rejection_reason?: boolean
          return_mode?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_return_for_adjustment?: boolean
          approval_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          module_id?: string
          name?: string
          notify_next_approver?: boolean
          require_rejection_reason?: boolean
          return_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flows_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "approval_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_history: {
        Row: {
          action: string
          action_by: string
          approval_request_id: string
          comments: string | null
          created_at: string
          id: string
          new_status: string | null
          old_status: string | null
          step_order: number | null
        }
        Insert: {
          action: string
          action_by: string
          approval_request_id: string
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          step_order?: number | null
        }
        Update: {
          action?: string
          action_by?: string
          approval_request_id?: string
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          step_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_history_action_by_fkey"
            columns: ["action_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_history_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_modules: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      approval_request_steps: {
        Row: {
          action_at: string | null
          approval_request_id: string
          approver_role_key: string | null
          approver_rule: string | null
          approver_user_id: string
          comments: string | null
          flow_step_id: string | null
          id: string
          resolved_from_user_id: string | null
          resolved_sector_id: string | null
          status: string
          step_order: number
        }
        Insert: {
          action_at?: string | null
          approval_request_id: string
          approver_role_key?: string | null
          approver_rule?: string | null
          approver_user_id: string
          comments?: string | null
          flow_step_id?: string | null
          id?: string
          resolved_from_user_id?: string | null
          resolved_sector_id?: string | null
          status?: string
          step_order: number
        }
        Update: {
          action_at?: string | null
          approval_request_id?: string
          approver_role_key?: string | null
          approver_rule?: string | null
          approver_user_id?: string
          comments?: string | null
          flow_step_id?: string | null
          id?: string
          resolved_from_user_id?: string | null
          resolved_sector_id?: string | null
          status?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_request_steps_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_request_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_request_steps_flow_step_id_fkey"
            columns: ["flow_step_id"]
            isOneToOne: false
            referencedRelation: "approval_flow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          created_at: string
          current_approver_user_id: string | null
          current_step_order: number | null
          ended_at: string | null
          flow_id: string
          id: string
          module_id: string
          reference_id: string
          requester_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_approver_user_id?: string | null
          current_step_order?: number | null
          ended_at?: string | null
          flow_id: string
          id?: string
          module_id: string
          reference_id: string
          requester_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_approver_user_id?: string | null
          current_step_order?: number | null
          ended_at?: string | null
          flow_id?: string
          id?: string
          module_id?: string
          reference_id?: string
          requester_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_current_approver_user_id_fkey"
            columns: ["current_approver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "approval_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      candidate_documents: {
        Row: {
          candidate_id: string
          document_id: string
          file_path: string | null
          id: string
          last_review_at: string | null
          metadata: Json | null
          status: Database["public"]["Enums"]["doc_status"]
          uploaded_at: string | null
        }
        Insert: {
          candidate_id: string
          document_id: string
          file_path?: string | null
          id?: string
          last_review_at?: string | null
          metadata?: Json | null
          status?: Database["public"]["Enums"]["doc_status"]
          uploaded_at?: string | null
        }
        Update: {
          candidate_id?: string
          document_id?: string
          file_path?: string | null
          id?: string
          last_review_at?: string | null
          metadata?: Json | null
          status?: Database["public"]["Enums"]["doc_status"]
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
          {
            foreignKeyName: "candidate_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          admission_request_id: string
          cidade: string | null
          cpf: string | null
          created_at: string
          curriculo_path: string | null
          email: string | null
          experiencia: string | null
          id: string
          indicacao_interna: boolean
          interview_address: string | null
          interview_approved: boolean | null
          interview_at: string | null
          interview_city: string | null
          interview_confirmed_at: string | null
          interview_confirmed_by: string | null
          interview_mode: string | null
          interview_notes: string | null
          interviewer_name: string | null
          meeting_link: string | null
          nome: string
          observacoes: string | null
          pants_size: string | null
          shirt_size: string | null
          shoe_size: string | null
          status_triagem: Database["public"]["Enums"]["candidate_status"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          admission_request_id: string
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          curriculo_path?: string | null
          email?: string | null
          experiencia?: string | null
          id?: string
          indicacao_interna?: boolean
          interview_address?: string | null
          interview_approved?: boolean | null
          interview_at?: string | null
          interview_city?: string | null
          interview_confirmed_at?: string | null
          interview_confirmed_by?: string | null
          interview_mode?: string | null
          interview_notes?: string | null
          interviewer_name?: string | null
          meeting_link?: string | null
          nome: string
          observacoes?: string | null
          pants_size?: string | null
          shirt_size?: string | null
          shoe_size?: string | null
          status_triagem?: Database["public"]["Enums"]["candidate_status"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          admission_request_id?: string
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          curriculo_path?: string | null
          email?: string | null
          experiencia?: string | null
          id?: string
          indicacao_interna?: boolean
          interview_address?: string | null
          interview_approved?: boolean | null
          interview_at?: string | null
          interview_city?: string | null
          interview_confirmed_at?: string | null
          interview_confirmed_by?: string | null
          interview_mode?: string | null
          interview_notes?: string | null
          interviewer_name?: string | null
          meeting_link?: string | null
          nome?: string
          observacoes?: string | null
          pants_size?: string | null
          shirt_size?: string | null
          shoe_size?: string | null
          status_triagem?: Database["public"]["Enums"]["candidate_status"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "admission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_admission_request_id_fkey"
            columns: ["admission_request_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          telefone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      collaborators: {
        Row: {
          active: boolean
          admission_request_id: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          full_name: string
          id: string
          observacoes: string | null
          pants_size: string | null
          rg: string | null
          role_name: string
          sector_id: string | null
          shirt_size: string | null
          shoe_size: string | null
          status: string
          telefone: string | null
          uniform_sizes: Json | null
          updated_at: string
          user_profile_id: string | null
          worksite: string
        }
        Insert: {
          active?: boolean
          admission_request_id?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          full_name: string
          id?: string
          observacoes?: string | null
          pants_size?: string | null
          rg?: string | null
          role_name?: string
          sector_id?: string | null
          shirt_size?: string | null
          shoe_size?: string | null
          status?: string
          telefone?: string | null
          uniform_sizes?: Json | null
          updated_at?: string
          user_profile_id?: string | null
          worksite?: string
        }
        Update: {
          active?: boolean
          admission_request_id?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          full_name?: string
          id?: string
          observacoes?: string | null
          pants_size?: string | null
          rg?: string | null
          role_name?: string
          sector_id?: string | null
          shirt_size?: string | null
          shoe_size?: string | null
          status?: string
          telefone?: string | null
          uniform_sizes?: Json | null
          updated_at?: string
          user_profile_id?: string | null
          worksite?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reviews: {
        Row: {
          candidate_document_id: string
          created_at: string
          decision: Database["public"]["Enums"]["doc_status"]
          id: string
          reason: string | null
          reviewer_user_id: string
        }
        Insert: {
          candidate_document_id: string
          created_at?: string
          decision: Database["public"]["Enums"]["doc_status"]
          id?: string
          reason?: string | null
          reviewer_user_id: string
        }
        Update: {
          candidate_document_id?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["doc_status"]
          id?: string
          reason?: string | null
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reviews_candidate_document_id_fkey"
            columns: ["candidate_document_id"]
            isOneToOne: false
            referencedRelation: "candidate_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          applies_condition: Json | null
          id: string
          key: string
          label: string
          required: boolean
        }
        Insert: {
          applies_condition?: Json | null
          id?: string
          key: string
          label: string
          required?: boolean
        }
        Update: {
          applies_condition?: Json | null
          id?: string
          key?: string
          label?: string
          required?: boolean
        }
        Relationships: []
      }
      dynamic_categories: {
        Row: {
          created_at: string
          created_by: string | null
          field_key: string
          id: string
          is_active: boolean
          label: string
          module: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_key: string
          id?: string
          is_active?: boolean
          label: string
          module: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_key?: string
          id?: string
          is_active?: boolean
          label?: string
          module?: string
        }
        Relationships: []
      }
      epi_deliveries: {
        Row: {
          collaborator_id: string
          created_at: string
          current_status: string
          delivered_at: string
          delivered_by_user_id: string
          document_url: string | null
          epi_item_id: string
          id: string
          notes: string
          quantity: number
          reason: string
          sector_id: string | null
          signature_employee_url: string | null
          signature_responsible_url: string | null
          size: string | null
          updated_at: string
          worksite: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          current_status?: string
          delivered_at?: string
          delivered_by_user_id: string
          document_url?: string | null
          epi_item_id: string
          id?: string
          notes?: string
          quantity?: number
          reason?: string
          sector_id?: string | null
          signature_employee_url?: string | null
          signature_responsible_url?: string | null
          size?: string | null
          updated_at?: string
          worksite?: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          current_status?: string
          delivered_at?: string
          delivered_by_user_id?: string
          document_url?: string | null
          epi_item_id?: string
          id?: string
          notes?: string
          quantity?: number
          reason?: string
          sector_id?: string | null
          signature_employee_url?: string | null
          signature_responsible_url?: string | null
          size?: string | null
          updated_at?: string
          worksite?: string
        }
        Relationships: [
          {
            foreignKeyName: "epi_deliveries_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_deliveries_delivered_by_user_id_fkey"
            columns: ["delivered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_deliveries_epi_item_id_fkey"
            columns: ["epi_item_id"]
            isOneToOne: false
            referencedRelation: "epi_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_deliveries_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      epi_items: {
        Row: {
          active: boolean
          ca_number: string
          ca_valid_until: string | null
          category: string
          code: string
          created_at: string
          id: string
          manufacturer: string
          name: string
          notes: string
          size_required: boolean
          unit: string
          updated_at: string
          useful_life_days: number | null
        }
        Insert: {
          active?: boolean
          ca_number?: string
          ca_valid_until?: string | null
          category?: string
          code?: string
          created_at?: string
          id?: string
          manufacturer?: string
          name: string
          notes?: string
          size_required?: boolean
          unit?: string
          updated_at?: string
          useful_life_days?: number | null
        }
        Update: {
          active?: boolean
          ca_number?: string
          ca_valid_until?: string | null
          category?: string
          code?: string
          created_at?: string
          id?: string
          manufacturer?: string
          name?: string
          notes?: string
          size_required?: boolean
          unit?: string
          updated_at?: string
          useful_life_days?: number | null
        }
        Relationships: []
      }
      epi_kit_rules: {
        Row: {
          active: boolean
          created_at: string
          epi_item_id: string
          id: string
          quantity: number
          required: boolean
          role_name: string
          sector_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          epi_item_id: string
          id?: string
          quantity?: number
          required?: boolean
          role_name?: string
          sector_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          epi_item_id?: string
          id?: string
          quantity?: number
          required?: boolean
          role_name?: string
          sector_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "epi_kit_rules_epi_item_id_fkey"
            columns: ["epi_item_id"]
            isOneToOne: false
            referencedRelation: "epi_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_kit_rules_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      epi_movements: {
        Row: {
          attachment_url: string | null
          condition: string
          created_at: string
          delivery_id: string
          id: string
          moved_at: string
          moved_by_user_id: string
          movement_type: string
          notes: string
          reason: string
        }
        Insert: {
          attachment_url?: string | null
          condition?: string
          created_at?: string
          delivery_id: string
          id?: string
          moved_at?: string
          moved_by_user_id: string
          movement_type?: string
          notes?: string
          reason?: string
        }
        Update: {
          attachment_url?: string | null
          condition?: string
          created_at?: string
          delivery_id?: string
          id?: string
          moved_at?: string
          moved_by_user_id?: string
          movement_type?: string
          notes?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "epi_movements_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "epi_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_movements_moved_by_user_id_fkey"
            columns: ["moved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_attachments: {
        Row: {
          file_path: string
          fuel_request_id: string
          id: string
          type: Database["public"]["Enums"]["fuel_attachment_type"]
          uploaded_at: string
        }
        Insert: {
          file_path: string
          fuel_request_id: string
          id?: string
          type: Database["public"]["Enums"]["fuel_attachment_type"]
          uploaded_at?: string
        }
        Update: {
          file_path?: string
          fuel_request_id?: string
          id?: string
          type?: Database["public"]["Enums"]["fuel_attachment_type"]
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_attachments_fuel_request_id_fkey"
            columns: ["fuel_request_id"]
            isOneToOne: false
            referencedRelation: "fuel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_requests: {
        Row: {
          assigned_to_user_id: string | null
          bank_account: string | null
          bank_agency: string | null
          bank_name: string | null
          categoria: string | null
          created_at: string
          daily_category: string | null
          daily_value: number | null
          data_abastecimento: string
          deleted_at: string | null
          deleted_by: string | null
          hours: number | null
          id: string
          km: string | null
          motivo: string | null
          notes: string | null
          oc_notes: string | null
          oc_number: string | null
          oc_uploaded_at: string | null
          oc_uploaded_by: string | null
          paid_at: string | null
          paid_by: string | null
          payment_due_date: string | null
          payment_method: string | null
          payment_notes: string | null
          person_cpf: string | null
          person_name: string | null
          pix_key: string | null
          pix_key_type: string | null
          placa: string | null
          requester_user_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["fuel_status"]
          type: string
          updated_at: string
          valor: number
        }
        Insert: {
          assigned_to_user_id?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          categoria?: string | null
          created_at?: string
          daily_category?: string | null
          daily_value?: number | null
          data_abastecimento?: string
          deleted_at?: string | null
          deleted_by?: string | null
          hours?: number | null
          id?: string
          km?: string | null
          motivo?: string | null
          notes?: string | null
          oc_notes?: string | null
          oc_number?: string | null
          oc_uploaded_at?: string | null
          oc_uploaded_by?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_due_date?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          person_cpf?: string | null
          person_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          placa?: string | null
          requester_user_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["fuel_status"]
          type?: string
          updated_at?: string
          valor: number
        }
        Update: {
          assigned_to_user_id?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          categoria?: string | null
          created_at?: string
          daily_category?: string | null
          daily_value?: number | null
          data_abastecimento?: string
          deleted_at?: string | null
          deleted_by?: string | null
          hours?: number | null
          id?: string
          km?: string | null
          motivo?: string | null
          notes?: string | null
          oc_notes?: string | null
          oc_number?: string | null
          oc_uploaded_at?: string | null
          oc_uploaded_by?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_due_date?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          person_cpf?: string | null
          person_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          placa?: string | null
          requester_user_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["fuel_status"]
          type?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fuel_requests_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_reviews: {
        Row: {
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"]
          fuel_request_id: string
          id: string
          reason: string | null
          reviewer_user_id: string
        }
        Insert: {
          created_at?: string
          decision: Database["public"]["Enums"]["review_decision"]
          fuel_request_id: string
          id?: string
          reason?: string | null
          reviewer_user_id: string
        }
        Update: {
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"]
          fuel_request_id?: string
          id?: string
          reason?: string | null
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_reviews_fuel_request_id_fkey"
            columns: ["fuel_request_id"]
            isOneToOne: false
            referencedRelation: "fuel_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_exams: {
        Row: {
          candidate_id: string
          clinic_id: string | null
          clinic_name: string | null
          guide_pdf_path: string | null
          id: string
          restrictions: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["exam_status"]
          updated_at: string
        }
        Insert: {
          candidate_id: string
          clinic_id?: string | null
          clinic_name?: string | null
          guide_pdf_path?: string | null
          id?: string
          restrictions?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          clinic_id?: string | null
          clinic_name?: string | null
          guide_pdf_path?: string | null
          id?: string
          restrictions?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_exams_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_exams_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
          {
            foreignKeyName: "medical_exams_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          message: string
          metadata: Json | null
          read: boolean
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      permission_actions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      permission_modules: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          description: string
          id: string
          key: string
        }
        Insert: {
          description?: string
          id?: string
          key: string
        }
        Update: {
          description?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          department: string
          email: string
          full_name: string
          id: string
          manager_user_id: string | null
          notification_preferences: Json
          sector_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          department?: string
          email?: string
          full_name?: string
          id: string
          manager_user_id?: string | null
          notification_preferences?: Json
          sector_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          department?: string
          email?: string
          full_name?: string
          id?: string
          manager_user_id?: string | null
          notification_preferences?: Json
          sector_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      public_tokens: {
        Row: {
          candidate_id: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_tokens_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_tokens_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
        ]
      }
      request_limits: {
        Row: {
          created_at: string
          daily_limit: number
          id: string
          request_type: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          id?: string
          request_type: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          id?: string
          request_type?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permission_matrix: {
        Row: {
          action_id: string
          allowed: boolean
          created_at: string
          id: string
          module_id: string
          role_id: string
        }
        Insert: {
          action_id: string
          allowed?: boolean
          created_at?: string
          id?: string
          module_id: string
          role_id: string
        }
        Update: {
          action_id?: string
          allowed?: boolean
          created_at?: string
          id?: string
          module_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_matrix_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "permission_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_matrix_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_matrix_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          active: boolean
          description: string
          id: string
          is_master: boolean
          is_system: boolean
          key: string
          name: string
          parent_role_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          description?: string
          id?: string
          is_master?: boolean
          is_system?: boolean
          key: string
          name?: string
          parent_role_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          description?: string
          id?: string
          is_master?: boolean
          is_system?: boolean
          key?: string
          name?: string
          parent_role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_parent_role_id_fkey"
            columns: ["parent_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          responsible_user_id: string | null
          substitute_user_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          responsible_user_id?: string | null
          substitute_user_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          responsible_user_id?: string | null
          substitute_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_substitute_user_id_fkey"
            columns: ["substitute_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          entity_id: string
          entity_type: string
          from_status: string | null
          id: string
          module: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: string
          module: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: string
          module?: string
          to_status?: string
        }
        Relationships: []
      }
      system_registrations: {
        Row: {
          candidate_id: string
          completed_at: string | null
          entrega_epi: boolean
          esocial: boolean
          folha_pagamento: boolean
          id: string
          ponto: boolean
          sistema_interno: boolean
        }
        Insert: {
          candidate_id: string
          completed_at?: string | null
          entrega_epi?: boolean
          esocial?: boolean
          folha_pagamento?: boolean
          id?: string
          ponto?: boolean
          sistema_interno?: boolean
        }
        Update: {
          candidate_id?: string
          completed_at?: string | null
          entrega_epi?: boolean
          esocial?: boolean
          folha_pagamento?: boolean
          id?: string
          ponto?: boolean
          sistema_interno?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "system_registrations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_registrations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "vw_admissions_list_items"
            referencedColumns: ["candidato_id"]
          },
        ]
      }
      user_effective_permissions: {
        Row: {
          action_id: string
          allowed: boolean
          created_at: string
          id: string
          module_id: string
          user_id: string
        }
        Insert: {
          action_id: string
          allowed: boolean
          created_at?: string
          id?: string
          module_id: string
          user_id: string
        }
        Update: {
          action_id?: string
          allowed?: boolean
          created_at?: string
          id?: string
          module_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_effective_permissions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "permission_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_effective_permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_effective_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          action_id: string
          allowed: boolean
          created_at: string
          created_by: string | null
          id: string
          module_id: string
          user_id: string
        }
        Insert: {
          action_id: string
          allowed: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          module_id: string
          user_id: string
        }
        Update: {
          action_id?: string
          allowed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          module_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "permission_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          km: number
          modelo: string
          observacoes: string | null
          placa: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          km?: number
          modelo: string
          observacoes?: string | null
          placa: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          km?: number
          modelo?: string
          observacoes?: string | null
          placa?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_admission_metrics: {
        Row: {
          cancelados: number | null
          centro_custo: string | null
          concluidos: number | null
          pendentes: number | null
          salario_total: number | null
          status: Database["public"]["Enums"]["admission_status"] | null
          total: number | null
        }
        Relationships: []
      }
      vw_admissions_list_items: {
        Row: {
          candidato_id: string | null
          candidato_nome: string | null
          cargo_funcao: string | null
          centro_custo: string | null
          created_at: string | null
          data_prevista_inicio: string | null
          documentos_status: string | null
          gestor_responsavel: string | null
          id: string | null
          jornada: string | null
          local_contratacao: string | null
          motivo: string | null
          priority: string | null
          requester_user_id: string | null
          salario_previsto: number | null
          solicitante_nome: string | null
          status: Database["public"]["Enums"]["admission_status"] | null
          tipo_contrato: string | null
          total_candidatos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fuel_metrics: {
        Row: {
          aprovados: number | null
          encerrados: number | null
          pendentes: number | null
          reprovados: number | null
          status: Database["public"]["Enums"]["fuel_status"] | null
          total: number | null
          type: string | null
          valor_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_purge_test_data: {
        Args: { _confirm?: boolean; _scope: string }
        Returns: Json
      }
      admission_set_status: {
        Args: {
          _metadata?: Json
          _reason?: string
          _request_id: string
          _to_status: Database["public"]["Enums"]["admission_status"]
        }
        Returns: Json
      }
      current_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      current_user_has_permission: {
        Args: { p_action_code: string; p_module_code: string }
        Returns: boolean
      }
      current_user_id: { Args: never; Returns: string }
      fuel_set_status: {
        Args: {
          _metadata?: Json
          _reason?: string
          _request_id: string
          _to_status: Database["public"]["Enums"]["fuel_status"]
        }
        Returns: Json
      }
      get_dashboard_metrics: { Args: never; Returns: Json }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_permission: {
        Args: {
          p_action_code: string
          p_module_code: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_approval_action: {
        Args: {
          p_action: string
          p_approval_request_id: string
          p_comments?: string
        }
        Returns: Json
      }
      rebuild_user_permissions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      replace_approval_flow_steps: {
        Args: { p_flow_id: string; p_steps: Json }
        Returns: Json
      }
      soft_delete_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: Json
      }
      start_approval_flow: {
        Args: {
          p_module_code: string
          p_reference_id: string
          p_requester_user_id: string
        }
        Returns: Json
      }
      user_participates_in_approval: {
        Args: { p_approval_request_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admission_status:
        | "rascunho"
        | "aguardando_triagem"
        | "em_triagem"
        | "aguardando_documentos"
        | "documentos_em_analise"
        | "aguardando_exame"
        | "exame_realizado"
        | "aguardando_registro"
        | "registros_concluidos"
        | "concluido"
        | "cancelado"
        | "arquivado"
      app_role:
        | "diretoria"
        | "administrativo"
        | "colaborador"
        | "rh"
        | "supervisor"
        | "financeiro"
        | "compras"
        | "master"
      candidate_status:
        | "novo"
        | "em_triagem"
        | "aprovado"
        | "reprovado"
        | "desistente"
      doc_status: "pending" | "submitted" | "approved" | "rejected"
      exam_status: "aguardando" | "apto" | "apto_com_restricao" | "inapto"
      fuel_attachment_type: "hodometro" | "nota_fiscal"
      fuel_status:
        | "rascunho"
        | "enviado"
        | "em_aprovacao"
        | "retornado"
        | "aguardando_fotos"
        | "em_revisao_admin"
        | "aprovado"
        | "reprovado"
        | "encerrado"
        | "concluido"
        | "ativa"
        | "em_revisao"
        | "aguardando_oc"
        | "aguardando_pagamento"
        | "pago"
      notification_channel: "in_app" | "email"
      review_decision: "approved" | "rejected" | "needs_revision"
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
      admission_status: [
        "rascunho",
        "aguardando_triagem",
        "em_triagem",
        "aguardando_documentos",
        "documentos_em_analise",
        "aguardando_exame",
        "exame_realizado",
        "aguardando_registro",
        "registros_concluidos",
        "concluido",
        "cancelado",
        "arquivado",
      ],
      app_role: [
        "diretoria",
        "administrativo",
        "colaborador",
        "rh",
        "supervisor",
        "financeiro",
        "compras",
        "master",
      ],
      candidate_status: [
        "novo",
        "em_triagem",
        "aprovado",
        "reprovado",
        "desistente",
      ],
      doc_status: ["pending", "submitted", "approved", "rejected"],
      exam_status: ["aguardando", "apto", "apto_com_restricao", "inapto"],
      fuel_attachment_type: ["hodometro", "nota_fiscal"],
      fuel_status: [
        "rascunho",
        "enviado",
        "em_aprovacao",
        "retornado",
        "aguardando_fotos",
        "em_revisao_admin",
        "aprovado",
        "reprovado",
        "encerrado",
        "concluido",
        "ativa",
        "em_revisao",
        "aguardando_oc",
        "aguardando_pagamento",
        "pago",
      ],
      notification_channel: ["in_app", "email"],
      review_decision: ["approved", "rejected", "needs_revision"],
    },
  },
} as const
