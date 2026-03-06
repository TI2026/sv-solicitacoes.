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
          priority: string
          requester_user_id: string
          salario_previsto: number | null
          status: Database["public"]["Enums"]["admission_status"]
          tipo_contrato: string
          updated_at: string
          welcome_local_apresentacao: string | null
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
          priority?: string
          requester_user_id: string
          salario_previsto?: number | null
          status?: Database["public"]["Enums"]["admission_status"]
          tipo_contrato?: string
          updated_at?: string
          welcome_local_apresentacao?: string | null
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
          priority?: string
          requester_user_id?: string
          salario_previsto?: number | null
          status?: Database["public"]["Enums"]["admission_status"]
          tipo_contrato?: string
          updated_at?: string
          welcome_local_apresentacao?: string | null
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
          payment_method: string | null
          person_cpf: string | null
          person_name: string | null
          pix_key: string | null
          placa: string | null
          requester_user_id: string
          status: Database["public"]["Enums"]["fuel_status"]
          type: string
          updated_at: string
          valor: number
        }
        Insert: {
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
          payment_method?: string | null
          person_cpf?: string | null
          person_name?: string | null
          pix_key?: string | null
          placa?: string | null
          requester_user_id: string
          status?: Database["public"]["Enums"]["fuel_status"]
          type?: string
          updated_at?: string
          valor: number
        }
        Update: {
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
          payment_method?: string | null
          person_cpf?: string | null
          person_name?: string | null
          pix_key?: string | null
          placa?: string | null
          requester_user_id?: string
          status?: Database["public"]["Enums"]["fuel_status"]
          type?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
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
          avatar_url: string | null
          created_at: string
          department: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string
          email?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
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
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      soft_delete_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: Json
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
      app_role: "diretoria" | "administrativo" | "colaborador" | "rh"
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
      app_role: ["diretoria", "administrativo", "colaborador", "rh"],
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
      ],
      notification_channel: ["in_app", "email"],
      review_decision: ["approved", "rejected", "needs_revision"],
    },
  },
} as const
