import { AppConfig } from '@/types';

// Validate required environment variables
const requiredEnvVars = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}. ` +
    'Please check your .env.local file or deployment environment configuration.'
  );
}

export const appConfig: AppConfig = {
  supabaseUrl: requiredEnvVars.supabaseUrl!,
  supabaseKey: requiredEnvVars.supabaseKey!,
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