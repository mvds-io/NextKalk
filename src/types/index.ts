export interface Airport {
  id: number;
  navn: string; // Original Norwegian field name
  name?: string; // Alternative field name
  pnr?: string; // Project number
  latitude: number;
  longitude: number;
  fylke: string;
  kommune: string;
  forening?: string; // Association/organization
  kontaktperson?: string; // Contact person
  phone?: string; // Phone number
  tonn?: number; // Weight in tons
  tonn_vann?: number; // Alternative field name for weight
  marker_color?: string;
  done: boolean;
  is_done?: boolean; // Database field name
  priority: number;
  comment?: string;
  comment_timestamp?: string;
  pdf_url?: string; // Contract/order URL
  created_at?: string;
  updated_at?: string;
}

export interface Landingsplass {
  id: number;
  lp: string; // Landingsplass number/identifier
  kode?: string; // Code/identifier 
  name?: string; // Name of the landingsplass
  latitude: number;
  longitude: number;
  fylke?: string;
  kommune?: string;
  tonn_lp?: number; // Weight in tons for landingsplass
  calculated_tonn?: number; // Calculated total tonnage from associated waters
  priority?: number;
  done: boolean;
  is_done?: boolean; // Database field name
  comment?: string;
  completed_at?: string; // Completion timestamp
  created_at?: string;
  updated_at?: string;
}

export interface KalkInfo {
  id: number;
  navn: string;
  latitude: number;
  longitude: number;
  fylke: string;
  kommune: string;
  comment?: string;
  comment_updated_at?: string;
}

export interface Association {
  id: number;
  airport_id: number;
  landingsplass_id: number;
  content: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
  can_edit_priority: boolean;
  can_edit_markers: boolean;
  display_name?: string;
}

export interface UserActionLog {
  id: number;
  user_email: string;
  action_type: string;
  target_type: string;
  target_id: number;
  target_name?: string;
  action_details?: any;
  timestamp: string;
}

export interface AppConfig {
  supabaseUrl: string;
  supabaseKey: string;
  airportsTable: string;
  kalkTable: string;
  landingsplassTable: string;
  associationsTable: string;
  vektseddelTable: string;
  storageBucket: string;
  usersTable: string;
  userActionLogsTable: string;
  imagesTables: {
    airports: string;
    kalkinfo: string;
    landingsplass: string;
  };
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MarkerStyle {
  color: string;
  icon: string;
  className?: string;
}

export type MarkerType = 'airport' | 'landingsplass' | 'kalk' | 'done' | 'user';

export interface FilterState {
  county: string;
  showConnections: boolean;
}

export interface CounterData {
  remaining: number;
  done: number;
} 