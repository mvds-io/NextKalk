import { supabase, queryWithRetry } from './supabase';
import type { Hazard, HazardGeometry, User } from '@/types';

const TABLE = 'hazards';

export type HazardCreateInput =
  | { geometry_type: 'circle'; geometry: { lat: number; lng: number; radius_m: number }; description: string }
  | { geometry_type: 'polyline'; geometry: { points: { lat: number; lng: number }[] }; description: string };

export function computeCentroid(
  geometry_type: 'circle' | 'polyline',
  geometry: HazardCreateInput['geometry']
): { lat: number; lng: number } {
  if (geometry_type === 'circle') {
    const g = geometry as { lat: number; lng: number; radius_m: number };
    return { lat: g.lat, lng: g.lng };
  }
  const pts = (geometry as { points: { lat: number; lng: number }[] }).points;
  if (!pts.length) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of pts) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

export function hazardToGeometry(h: Hazard): HazardGeometry {
  if (h.geometry_type === 'circle') {
    return {
      type: 'circle',
      lat: h.geometry.lat ?? 0,
      lng: h.geometry.lng ?? 0,
      radius_m: h.geometry.radius_m ?? 0,
    };
  }
  return {
    type: 'polyline',
    points: h.geometry.points ?? [],
  };
}

export async function loadHazards(): Promise<Hazard[]> {
  const result = await queryWithRetry(
    () => supabase.from(TABLE).select('*').order('created_at', { ascending: false }),
    'loadHazards'
  );
  return (result.data ?? []) as Hazard[];
}

export async function createHazard(input: HazardCreateInput, user: User | null): Promise<Hazard> {
  const center = computeCentroid(input.geometry_type, input.geometry);
  const row = {
    geometry_type: input.geometry_type,
    geometry: input.geometry,
    description: input.description,
    center_lat: center.lat,
    center_lng: center.lng,
    created_by: user?.email ?? null,
    updated_by: user?.email ?? null,
  };
  const result = await queryWithRetry(
    () => supabase.from(TABLE).insert(row).select().single(),
    'createHazard'
  );
  const hazard = result.data as Hazard;
  await logHazardAction({
    user,
    action_type: 'create_hazard',
    hazard,
    extra: { geometry: hazard.geometry },
  });
  return hazard;
}

export async function updateHazard(
  id: number,
  patch: { description?: string },
  previous: Hazard,
  user: User | null
): Promise<Hazard> {
  const update = {
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    updated_by: user?.email ?? null,
    updated_at: new Date().toISOString(),
  };
  const result = await queryWithRetry(
    () => supabase.from(TABLE).update(update).eq('id', id).select().single(),
    'updateHazard'
  );
  const hazard = result.data as Hazard;
  await logHazardAction({
    user,
    action_type: 'update_hazard',
    hazard,
    extra: {
      description_before: previous.description,
      description_after: hazard.description,
    },
  });
  return hazard;
}

export async function deleteHazard(hazard: Hazard, user: User | null): Promise<void> {
  await queryWithRetry(
    () => supabase.from(TABLE).delete().eq('id', hazard.id),
    'deleteHazard'
  );
  await logHazardAction({
    user,
    action_type: 'delete_hazard',
    hazard,
    extra: { snapshot: hazard },
  });
}

async function logHazardAction(args: {
  user: User | null;
  action_type: 'create_hazard' | 'update_hazard' | 'delete_hazard';
  hazard: Hazard;
  extra?: Record<string, unknown>;
}): Promise<void> {
  if (!args.user?.email) return;
  const { hazard } = args;
  try {
    await supabase.from('user_action_logs').insert({
      user_email: args.user.email,
      action_type: args.action_type,
      target_type: 'hazard',
      target_id: hazard.id,
      target_name:
        hazard.description.slice(0, 80) || `${hazard.geometry_type} #${hazard.id}`,
      action_details: {
        geometry_type: hazard.geometry_type,
        center: { lat: hazard.center_lat, lng: hazard.center_lng },
        ...(args.extra ?? {}),
      },
    });
  } catch (err) {
    console.warn('Failed to write hazard action log:', err);
  }
}
