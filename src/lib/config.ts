import { AppConfig } from '@/types';

export const appConfig: AppConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dglqobtmahurgbpjrtpw.supabase.co',
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbHFvYnRtYWh1cmdicGpydHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI2NjAzNTgsImV4cCI6MjA1ODIzNjM1OH0.E9U7FfBBquJ9Afa8ITi3rn4pQdWNW5rHvZlHOZLrPlM',
  airportsTable: 'vass_vann',
  kalkTable: 'vass_info',
  landingsplassTable: 'vass_lasteplass',
  associationsTable: 'vass_associations',
  vektseddelTable: 'vektseddel',
  storageBucket: 'vass-images',
  usersTable: 'users',
  userActionLogsTable: 'user_action_logs',
  imagesTables: {
    airports: 'airports_images',
    kalkinfo: 'kalk_images',
    landingsplass: 'landingsplass_images'
  }
};

export const loadingSteps = [
  'Kobler til database...',
  'Henter brukerinnstillinger...',
  'Initialiserer kart...',
  'Laster vann-data...',
  'Laster landingsplass-data...',
  'Laster kommentar-data...',
  'Setter opp filter...',
  'Bygger oversikt...',
  'Ferdiggjør...'
]; 