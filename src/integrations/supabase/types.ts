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
      absence_requests: {
        Row: {
          absence_date: string
          created_at: string
          document_name: string
          document_path: string
          document_size: number | null
          id: string
          reason: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          absence_date: string
          created_at?: string
          document_name: string
          document_path: string
          document_size?: number | null
          id?: string
          reason: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          absence_date?: string
          created_at?: string
          document_name?: string
          document_path?: string
          document_size?: number | null
          id?: string
          reason?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_due_dates: {
        Row: {
          assignment_name: string
          assignment_type: string
          created_at: string
          due_date: string
          id: string
          section: string | null
          updated_at: string
        }
        Insert: {
          assignment_name: string
          assignment_type?: string
          created_at?: string
          due_date: string
          id?: string
          section?: string | null
          updated_at?: string
        }
        Update: {
          assignment_name?: string
          assignment_type?: string
          created_at?: string
          due_date?: string
          id?: string
          section?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          assignment_type: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          group_id: string
          id: string
          uploaded_by: string
        }
        Insert: {
          assignment_type?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          group_id: string
          id?: string
          uploaded_by: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          group_id?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          assignment_name: string
          assignment_type: string
          graded_at: string
          id: string
          max_score: number
          score: number
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_name: string
          assignment_type: string
          graded_at?: string
          id?: string
          max_score: number
          score?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_name?: string
          assignment_type?: string
          graded_at?: string
          id?: string
          max_score?: number
          score?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitations: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          group_id: string
          id: string
          message: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          group_id: string
          id?: string
          message: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          group_id?: string
          id?: string
          message?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      group_notes: {
        Row: {
          category: string
          created_at: string
          group_id: string
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          group_id: string
          id?: string
          note?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          group_id?: string
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          leader_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          leader_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          leader_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          group_id: string
          id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          section: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          section?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          section?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      rubric_scores: {
        Row: {
          assignment_type: string
          created_at: string
          id: string
          scores: Json
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_type: string
          created_at?: string
          id?: string
          scores?: Json
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          id?: string
          scores?: Json
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_notes: {
        Row: {
          category: string
          created_at: string
          id: string
          note: string
          student_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          note?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          note?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          index_number: number | null
          name: string
          pin: string | null
          section: string
          student_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          index_number?: number | null
          name: string
          pin?: string | null
          section?: string
          student_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          index_number?: number | null
          name?: string
          pin?: string | null
          section?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_messages: {
        Row: {
          created_at: string
          id: string
          image_path: string | null
          is_read: boolean
          message: string
          message_type: string
          recipient_section: string | null
          recipient_student_id: string | null
          reply_to_id: string | null
          sender_student_id: string | null
          sender_type: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          is_read?: boolean
          message: string
          message_type: string
          recipient_section?: string | null
          recipient_student_id?: string | null
          reply_to_id?: string | null
          sender_student_id?: string | null
          sender_type: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          is_read?: boolean
          message?: string
          message_type?: string
          recipient_section?: string | null
          recipient_student_id?: string | null
          reply_to_id?: string | null
          sender_student_id?: string | null
          sender_type?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_messages_recipient_student_id_fkey"
            columns: ["recipient_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "teacher_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_messages_sender_student_id_fkey"
            columns: ["sender_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
