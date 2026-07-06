/**
 * Supabase database types — GENERATED, do not hand-edit.
 * Regenerate with the Supabase MCP `generate_typescript_types` tool (or
 * `supabase gen types typescript`) after any migration.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: '14.5';
	};
	public: {
		Tables: {
			affirmations: {
				Row: {
					active: boolean | null;
					created_at: string | null;
					id: string;
					text: string;
					theme: string | null;
					triggered_by: string | null;
				};
				Insert: {
					active?: boolean | null;
					created_at?: string | null;
					id?: string;
					text: string;
					theme?: string | null;
					triggered_by?: string | null;
				};
				Update: {
					active?: boolean | null;
					created_at?: string | null;
					id?: string;
					text?: string;
					theme?: string | null;
					triggered_by?: string | null;
				};
				Relationships: [];
			};
			approval_queue: {
				Row: {
					action_type: string;
					created_at: string | null;
					id: string;
					preview: Json | null;
					reasoning: string | null;
					related_project_id: string | null;
					resolved_at: string | null;
					source: string | null;
					status: string;
					suggested_action: string | null;
				};
				Insert: {
					action_type: string;
					created_at?: string | null;
					id?: string;
					preview?: Json | null;
					reasoning?: string | null;
					related_project_id?: string | null;
					resolved_at?: string | null;
					source?: string | null;
					status?: string;
					suggested_action?: string | null;
				};
				Update: {
					action_type?: string;
					created_at?: string | null;
					id?: string;
					preview?: Json | null;
					reasoning?: string | null;
					related_project_id?: string | null;
					resolved_at?: string | null;
					source?: string | null;
					status?: string;
					suggested_action?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'approval_queue_related_project_id_fkey';
						columns: ['related_project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
				];
			};
			audit_log: {
				Row: {
					action_taken: string | null;
					action_type: string | null;
					approved: boolean | null;
					created_at: string | null;
					id: string;
					observed: string | null;
					recommended: string | null;
					related_id: string | null;
				};
				Insert: {
					action_taken?: string | null;
					action_type?: string | null;
					approved?: boolean | null;
					created_at?: string | null;
					id?: string;
					observed?: string | null;
					recommended?: string | null;
					related_id?: string | null;
				};
				Update: {
					action_taken?: string | null;
					action_type?: string | null;
					approved?: boolean | null;
					created_at?: string | null;
					id?: string;
					observed?: string | null;
					recommended?: string | null;
					related_id?: string | null;
				};
				Relationships: [];
			};
			calendar_events: {
				Row: {
					attendees: Json | null;
					end_at: string | null;
					external_id: string | null;
					id: string;
					needs_prep: boolean | null;
					project_id: string | null;
					start_at: string | null;
					synced_at: string | null;
					title: string | null;
				};
				Insert: {
					attendees?: Json | null;
					end_at?: string | null;
					external_id?: string | null;
					id?: string;
					needs_prep?: boolean | null;
					project_id?: string | null;
					start_at?: string | null;
					synced_at?: string | null;
					title?: string | null;
				};
				Update: {
					attendees?: Json | null;
					end_at?: string | null;
					external_id?: string | null;
					id?: string;
					needs_prep?: boolean | null;
					project_id?: string | null;
					start_at?: string | null;
					synced_at?: string | null;
					title?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'calendar_events_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
				];
			};
			daily_briefings: {
				Row: {
					content: string;
					created_at: string | null;
					date: string;
					id: string;
					model: string | null;
				};
				Insert: {
					content: string;
					created_at?: string | null;
					date: string;
					id?: string;
					model?: string | null;
				};
				Update: {
					content?: string;
					created_at?: string | null;
					date?: string;
					id?: string;
					model?: string | null;
				};
				Relationships: [];
			};
			daily_checkins: {
				Row: {
					avoiding: string | null;
					completed: Json | null;
					created_at: string | null;
					date: string;
					gratitude: string | null;
					id: string;
					most_important: string | null;
					reflection: string | null;
					success_looks_like: string | null;
				};
				Insert: {
					avoiding?: string | null;
					completed?: Json | null;
					created_at?: string | null;
					date: string;
					gratitude?: string | null;
					id?: string;
					most_important?: string | null;
					reflection?: string | null;
					success_looks_like?: string | null;
				};
				Update: {
					avoiding?: string | null;
					completed?: Json | null;
					created_at?: string | null;
					date?: string;
					gratitude?: string | null;
					id?: string;
					most_important?: string | null;
					reflection?: string | null;
					success_looks_like?: string | null;
				};
				Relationships: [];
			};
			email_summaries: {
				Row: {
					category: string | null;
					external_id: string | null;
					from_addr: string | null;
					id: string;
					importance: number | null;
					project_id: string | null;
					subject: string | null;
					suggested_action: string | null;
					summary: string | null;
					synced_at: string | null;
				};
				Insert: {
					category?: string | null;
					external_id?: string | null;
					from_addr?: string | null;
					id?: string;
					importance?: number | null;
					project_id?: string | null;
					subject?: string | null;
					suggested_action?: string | null;
					summary?: string | null;
					synced_at?: string | null;
				};
				Update: {
					category?: string | null;
					external_id?: string | null;
					from_addr?: string | null;
					id?: string;
					importance?: number | null;
					project_id?: string | null;
					subject?: string | null;
					suggested_action?: string | null;
					summary?: string | null;
					synced_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'email_summaries_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
				];
			};
			engagements: {
				Row: {
					balance_due: number | null;
					contact_email: string | null;
					contact_name: string | null;
					contract_signed: boolean | null;
					created_at: string | null;
					deposit_paid: number | null;
					event_date: string | null;
					event_name: string;
					fee: number | null;
					follow_up_needed: boolean | null;
					format: string | null;
					id: string;
					invoice_sent: boolean | null;
					location: string | null;
					notes: string | null;
					organization: string | null;
					payment_received: boolean | null;
					prep_status: string | null;
					status: string;
					topic: string | null;
					updated_at: string | null;
				};
				Insert: {
					balance_due?: number | null;
					contact_email?: string | null;
					contact_name?: string | null;
					contract_signed?: boolean | null;
					created_at?: string | null;
					deposit_paid?: number | null;
					event_date?: string | null;
					event_name: string;
					fee?: number | null;
					follow_up_needed?: boolean | null;
					format?: string | null;
					id?: string;
					invoice_sent?: boolean | null;
					location?: string | null;
					notes?: string | null;
					organization?: string | null;
					payment_received?: boolean | null;
					prep_status?: string | null;
					status?: string;
					topic?: string | null;
					updated_at?: string | null;
				};
				Update: {
					balance_due?: number | null;
					contact_email?: string | null;
					contact_name?: string | null;
					contract_signed?: boolean | null;
					created_at?: string | null;
					deposit_paid?: number | null;
					event_date?: string | null;
					event_name?: string;
					fee?: number | null;
					follow_up_needed?: boolean | null;
					format?: string | null;
					id?: string;
					invoice_sent?: boolean | null;
					location?: string | null;
					notes?: string | null;
					organization?: string | null;
					payment_received?: boolean | null;
					prep_status?: string | null;
					status?: string;
					topic?: string | null;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			inquiries: {
				Row: {
					answers: Json;
					created_at: string;
					email: string | null;
					emailed: boolean;
					id: string;
					intent: string;
					name: string | null;
					organization: string | null;
					source_page: string | null;
					status: string;
				};
				Insert: {
					answers?: Json;
					created_at?: string;
					email?: string | null;
					emailed?: boolean;
					id?: string;
					intent: string;
					name?: string | null;
					organization?: string | null;
					source_page?: string | null;
					status?: string;
				};
				Update: {
					answers?: Json;
					created_at?: string;
					email?: string | null;
					emailed?: boolean;
					id?: string;
					intent?: string;
					name?: string | null;
					organization?: string | null;
					source_page?: string | null;
					status?: string;
				};
				Relationships: [];
			};
			projects: {
				Row: {
					created_at: string | null;
					deadline: string | null;
					id: string;
					impact: Database['public']['Enums']['priority'];
					name: string;
					next_action: string | null;
					notes: string | null;
					pillar: Database['public']['Enums']['pillar'];
					priority: Database['public']['Enums']['priority'];
					revenue_value: number | null;
					status: Database['public']['Enums']['project_status'];
					updated_at: string | null;
				};
				Insert: {
					created_at?: string | null;
					deadline?: string | null;
					id?: string;
					impact?: Database['public']['Enums']['priority'];
					name: string;
					next_action?: string | null;
					notes?: string | null;
					pillar: Database['public']['Enums']['pillar'];
					priority?: Database['public']['Enums']['priority'];
					revenue_value?: number | null;
					status?: Database['public']['Enums']['project_status'];
					updated_at?: string | null;
				};
				Update: {
					created_at?: string | null;
					deadline?: string | null;
					id?: string;
					impact?: Database['public']['Enums']['priority'];
					name?: string;
					next_action?: string | null;
					notes?: string | null;
					pillar?: Database['public']['Enums']['pillar'];
					priority?: Database['public']['Enums']['priority'];
					revenue_value?: number | null;
					status?: Database['public']['Enums']['project_status'];
					updated_at?: string | null;
				};
				Relationships: [];
			};
			revenue_items: {
				Row: {
					amount: number;
					business_line: Database['public']['Enums']['pillar'] | null;
					client: string | null;
					created_at: string | null;
					due_date: string | null;
					engagement_id: string | null;
					id: string;
					paid_date: string | null;
					source: string;
					status: string;
					stripe_ref: string | null;
				};
				Insert: {
					amount: number;
					business_line?: Database['public']['Enums']['pillar'] | null;
					client?: string | null;
					created_at?: string | null;
					due_date?: string | null;
					engagement_id?: string | null;
					id?: string;
					paid_date?: string | null;
					source: string;
					status?: string;
					stripe_ref?: string | null;
				};
				Update: {
					amount?: number;
					business_line?: Database['public']['Enums']['pillar'] | null;
					client?: string | null;
					created_at?: string | null;
					due_date?: string | null;
					engagement_id?: string | null;
					id?: string;
					paid_date?: string | null;
					source?: string;
					status?: string;
					stripe_ref?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'revenue_items_engagement_id_fkey';
						columns: ['engagement_id'];
						isOneToOne: false;
						referencedRelation: 'engagements';
						referencedColumns: ['id'];
					},
				];
			};
			subscribers: {
				Row: {
					created_at: string;
					email: string;
					id: string;
					source: string | null;
				};
				Insert: {
					created_at?: string;
					email: string;
					id?: string;
					source?: string | null;
				};
				Update: {
					created_at?: string;
					email?: string;
					id?: string;
					source?: string | null;
				};
				Relationships: [];
			};
			tasks: {
				Row: {
					completed_at: string | null;
					created_at: string | null;
					description: string | null;
					due_date: string | null;
					effort: string | null;
					id: string;
					impact_score: number | null;
					pillar: Database['public']['Enums']['pillar'];
					priority: Database['public']['Enums']['priority'];
					project_id: string | null;
					status: Database['public']['Enums']['task_status'];
					title: string;
					urgency_score: number | null;
				};
				Insert: {
					completed_at?: string | null;
					created_at?: string | null;
					description?: string | null;
					due_date?: string | null;
					effort?: string | null;
					id?: string;
					impact_score?: number | null;
					pillar?: Database['public']['Enums']['pillar'];
					priority?: Database['public']['Enums']['priority'];
					project_id?: string | null;
					status?: Database['public']['Enums']['task_status'];
					title: string;
					urgency_score?: number | null;
				};
				Update: {
					completed_at?: string | null;
					created_at?: string | null;
					description?: string | null;
					due_date?: string | null;
					effort?: string | null;
					id?: string;
					impact_score?: number | null;
					pillar?: Database['public']['Enums']['pillar'];
					priority?: Database['public']['Enums']['priority'];
					project_id?: string | null;
					status?: Database['public']['Enums']['task_status'];
					title?: string;
					urgency_score?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
				];
			};
			weekly_reviews: {
				Row: {
					created_at: string | null;
					id: string;
					lessons: string | null;
					missed_followups: Json | null;
					next_top3: Json | null;
					projects_advanced: Json | null;
					projects_stalled: Json | null;
					revenue_movement: string | null;
					week_start: string;
					wins: Json | null;
				};
				Insert: {
					created_at?: string | null;
					id?: string;
					lessons?: string | null;
					missed_followups?: Json | null;
					next_top3?: Json | null;
					projects_advanced?: Json | null;
					projects_stalled?: Json | null;
					revenue_movement?: string | null;
					week_start: string;
					wins?: Json | null;
				};
				Update: {
					created_at?: string | null;
					id?: string;
					lessons?: string | null;
					missed_followups?: Json | null;
					next_top3?: Json | null;
					projects_advanced?: Json | null;
					projects_stalled?: Json | null;
					revenue_movement?: string | null;
					week_start?: string;
					wins?: Json | null;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			pillar: 'jpmorgan' | 'voicepath' | 'ai_impact' | 'personal';
			priority: 'low' | 'medium' | 'high' | 'critical';
			project_status: 'active' | 'waiting' | 'stalled' | 'completed' | 'archived';
			task_status: 'not_started' | 'in_progress' | 'waiting' | 'done';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DefaultSchema = Database[Extract<keyof Omit<Database, '__InternalSupabase'>, 'public'>];

export type Tables<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Update'];
export type Enums<T extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][T];

export const Constants = {
	public: {
		Enums: {
			pillar: ['jpmorgan', 'voicepath', 'ai_impact', 'personal'],
			priority: ['low', 'medium', 'high', 'critical'],
			project_status: ['active', 'waiting', 'stalled', 'completed', 'archived'],
			task_status: ['not_started', 'in_progress', 'waiting', 'done'],
		},
	},
} as const;
