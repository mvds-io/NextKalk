/**
 * Optimization Utilities for Landingsplass Planning
 * Provides algorithms for optimizing landingsplass placement and assignments
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface LandingsplassWithCoords {
  id: number;
  lp: string;
  latitude: number;
  longitude: number;
  is_active?: boolean;
  is_active_in_planning?: boolean;
  tonn_lp?: number;
  [key: string]: any;
}

export interface VannWithCoords {
  id: number;
  name: string | null;
  latitude: number;
  longitude: number;
  tonn?: string | number;
  [key: string]: any;
}

export interface Association {
  id?: number;
  airport_id: number;
  landingsplass_id: number;
  distance_km?: number;
}

export interface ReassignmentResult {
  vannId: number;
  vannName: string | null;
  oldLpId: number | null;
  newLpId: number | null;
  newLpName: string | null;
  oldDistance: number;
  newDistance: number;
  distanceChange: number;
}

export interface OptimizationStats {
  totalDistance: number;
  averageDistance: number;
  maxDistance: number;
  minDistance: number;
  numAssociations: number;
  numActiveLandingsplasser: number;
  numVann: number;
}

export interface ClusterResult {
  centroid: Coordinate;
  members: VannWithCoords[];
  totalTonnage: number;
  averageDistance: number;
}

// ============================================================================
// Distance Calculations
// ============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the closest landingsplass to a given vann marker
 * @param vann The vann marker
 * @param landingsplasser Array of landingsplasser to search
 * @param excludeIds Optional array of LP IDs to exclude from search
 * @returns The closest landingsplass and distance, or null if none found
 */
export function findClosestLandingsplass(
  vann: VannWithCoords,
  landingsplasser: LandingsplassWithCoords[],
  excludeIds: number[] = []
): { lp: LandingsplassWithCoords; distance: number } | null {
  let closestLp: LandingsplassWithCoords | null = null;
  let minDistance = Infinity;

  for (const lp of landingsplasser) {
    // Skip if in exclude list
    if (excludeIds.includes(lp.id)) continue;

    // Skip if not active in planning mode
    if (lp.is_active_in_planning === false) continue;

    // Skip if missing coordinates
    if (!lp.latitude || !lp.longitude) continue;

    const distance = calculateDistance(
      vann.latitude,
      vann.longitude,
      lp.latitude,
      lp.longitude
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestLp = lp;
    }
  }

  if (!closestLp) return null;

  return { lp: closestLp, distance: minDistance };
}

// ============================================================================
// Reassignment Algorithms
// ============================================================================

/**
 * Reassign all vann from deactivated landingsplasser to the next closest active LP
 * @param deactivatedLpIds Array of deactivated landingsplass IDs
 * @param allVann All vann markers
 * @param allLandingsplasser All landingsplasser
 * @param currentAssociations Current associations
 * @returns Array of reassignment results
 */
export function reassignVannFromDeactivatedLPs(
  deactivatedLpIds: number[],
  allVann: VannWithCoords[],
  allLandingsplasser: LandingsplassWithCoords[],
  currentAssociations: Association[]
): ReassignmentResult[] {
  const reassignments: ReassignmentResult[] = [];

  // Create a map of vann ID to current association
  const vannToLpMap = new Map<number, { lpId: number; distance: number }>();
  currentAssociations.forEach((assoc) => {
    vannToLpMap.set(assoc.airport_id, {
      lpId: assoc.landingsplass_id,
      distance: assoc.distance_km || 0,
    });
  });

  // Filter to only active landingsplasser
  const activeLandingsplasser = allLandingsplasser.filter(
    (lp) => !deactivatedLpIds.includes(lp.id) && lp.is_active_in_planning !== false
  );

  // Process each vann
  for (const vann of allVann) {
    const currentAssoc = vannToLpMap.get(vann.id);

    // Skip if vann doesn't have current association
    if (!currentAssoc) continue;

    // Check if vann's current LP is deactivated
    if (!deactivatedLpIds.includes(currentAssoc.lpId)) {
      // Not affected by deactivation, skip
      continue;
    }

    // Find new closest LP
    const closest = findClosestLandingsplass(vann, activeLandingsplasser, []);

    if (!closest) {
      console.warn(`No active landingsplass found for vann ${vann.id}`);
      continue;
    }

    const distanceChange = closest.distance - currentAssoc.distance;

    reassignments.push({
      vannId: vann.id,
      vannName: vann.name,
      oldLpId: currentAssoc.lpId,
      newLpId: closest.lp.id,
      newLpName: closest.lp.lp,
      oldDistance: currentAssoc.distance,
      newDistance: closest.distance,
      distanceChange: distanceChange,
    });
  }

  return reassignments;
}

/**
 * Calculate optimization statistics for a set of associations
 */
export function calculateOptimizationStats(
  associations: Association[],
  landingsplasser: LandingsplassWithCoords[],
  vann: VannWithCoords[]
): OptimizationStats {
  const distances = associations
    .map((a) => a.distance_km || 0)
    .filter((d) => d > 0);

  // Filter for active landingsplasser
  // Check both is_active (from vass_lasteplass) and is_active_in_planning (planning mode)
  const activeLPs = landingsplasser.filter((lp) => {
    // If is_active field exists, use it (takes priority)
    if ('is_active' in lp && lp.is_active !== undefined) {
      return lp.is_active !== false;
    }
    // Otherwise fall back to is_active_in_planning
    if ('is_active_in_planning' in lp) {
      return lp.is_active_in_planning !== false;
    }
    // If neither field exists, consider it active by default
    return true;
  });

  return {
    totalDistance: distances.reduce((sum, d) => sum + d, 0),
    averageDistance: distances.length > 0
      ? distances.reduce((sum, d) => sum + d, 0) / distances.length
      : 0,
    maxDistance: distances.length > 0 ? Math.max(...distances) : 0,
    minDistance: distances.length > 0 ? Math.min(...distances) : 0,
    numAssociations: associations.length,
    numActiveLandingsplasser: activeLPs.length,
    numVann: vann.length,
  };
}

// ============================================================================
// K-Means Clustering for Optimal LP Placement
// ============================================================================

/**
 * K-means clustering algorithm to find optimal landingsplass positions
 * @param vann Array of vann markers to cluster
 * @param k Number of clusters (landingsplasser)
 * @param maxIterations Maximum iterations for convergence
 * @returns Array of optimal centroids (suggested LP positions)
 */
export function kMeansClustering(
  vann: VannWithCoords[],
  k: number,
  maxIterations: number = 100
): ClusterResult[] {
  if (vann.length === 0) return [];
  if (k <= 0) return [];
  if (k > vann.length) k = vann.length;

  // Initialize centroids using k-means++ method
  const centroids: Coordinate[] = initializeCentroidsKMeansPlusPlus(vann, k);

  let iterations = 0;
  let converged = false;

  while (iterations < maxIterations && !converged) {
    // Assign each vann to nearest centroid
    const clusters: VannWithCoords[][] = Array.from({ length: k }, () => []);

    for (const v of vann) {
      let minDist = Infinity;
      let closestCluster = 0;

      for (let i = 0; i < k; i++) {
        const dist = calculateDistance(
          v.latitude,
          v.longitude,
          centroids[i].latitude,
          centroids[i].longitude
        );
        if (dist < minDist) {
          minDist = dist;
          closestCluster = i;
        }
      }

      clusters[closestCluster].push(v);
    }

    // Recalculate centroids
    const newCentroids: Coordinate[] = [];
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) {
        // Keep old centroid if cluster is empty
        newCentroids.push(centroids[i]);
        continue;
      }

      const avgLat =
        clusters[i].reduce((sum, v) => sum + v.latitude, 0) / clusters[i].length;
      const avgLon =
        clusters[i].reduce((sum, v) => sum + v.longitude, 0) / clusters[i].length;

      newCentroids.push({ latitude: avgLat, longitude: avgLon });
    }

    // Check for convergence
    converged = true;
    for (let i = 0; i < k; i++) {
      const dist = calculateDistance(
        centroids[i].latitude,
        centroids[i].longitude,
        newCentroids[i].latitude,
        newCentroids[i].longitude
      );
      if (dist > 0.001) {
        // More than ~1 meter difference
        converged = false;
        break;
      }
    }

    centroids.splice(0, centroids.length, ...newCentroids);
    iterations++;
  }

  // Build cluster results with statistics
  const results: ClusterResult[] = [];
  for (let i = 0; i < k; i++) {
    const members: VannWithCoords[] = [];
    let totalTonnage = 0;
    let totalDistance = 0;

    for (const v of vann) {
      const dist = calculateDistance(
        v.latitude,
        v.longitude,
        centroids[i].latitude,
        centroids[i].longitude
      );

      // Find which cluster this vann belongs to
      let minDist = Infinity;
      let belongsToCluster = -1;
      for (let j = 0; j < k; j++) {
        const d = calculateDistance(
          v.latitude,
          v.longitude,
          centroids[j].latitude,
          centroids[j].longitude
        );
        if (d < minDist) {
          minDist = d;
          belongsToCluster = j;
        }
      }

      if (belongsToCluster === i) {
        members.push(v);
        totalDistance += minDist;

        // Parse tonnage
        if (v.tonn) {
          const tonnage = typeof v.tonn === 'string'
            ? parseFloat(v.tonn.replace(',', '.'))
            : v.tonn;
          if (!isNaN(tonnage)) {
            totalTonnage += tonnage;
          }
        }
      }
    }

    results.push({
      centroid: centroids[i],
      members,
      totalTonnage,
      averageDistance: members.length > 0 ? totalDistance / members.length : 0,
    });
  }

  return results;
}

/**
 * Initialize centroids using k-means++ algorithm (better than random)
 */
function initializeCentroidsKMeansPlusPlus(
  vann: VannWithCoords[],
  k: number
): Coordinate[] {
  const centroids: Coordinate[] = [];

  // Choose first centroid randomly
  const firstIdx = Math.floor(Math.random() * vann.length);
  centroids.push({
    latitude: vann[firstIdx].latitude,
    longitude: vann[firstIdx].longitude,
  });

  // Choose remaining centroids with probability proportional to distance from nearest centroid
  for (let i = 1; i < k; i++) {
    const distances: number[] = [];
    let totalDistance = 0;

    // Calculate distance from each point to nearest centroid
    for (const v of vann) {
      let minDist = Infinity;
      for (const c of centroids) {
        const dist = calculateDistance(
          v.latitude,
          v.longitude,
          c.latitude,
          c.longitude
        );
        minDist = Math.min(minDist, dist);
      }
      distances.push(minDist * minDist); // Square for more spread
      totalDistance += minDist * minDist;
    }

    // Choose next centroid with probability proportional to squared distance
    const rand = Math.random() * totalDistance;
    let cumulative = 0;
    for (let j = 0; j < vann.length; j++) {
      cumulative += distances[j];
      if (cumulative >= rand) {
        centroids.push({
          latitude: vann[j].latitude,
          longitude: vann[j].longitude,
        });
        break;
      }
    }
  }

  return centroids;
}

/**
 * Suggest optimal number of landingsplasser using elbow method
 * Tests different k values and finds where improvement diminishes
 */
export function suggestOptimalK(
  vann: VannWithCoords[],
  maxK: number = 20
): { k: number; score: number; allScores: { k: number; score: number }[] } {
  const scores: { k: number; score: number }[] = [];

  for (let k = 1; k <= Math.min(maxK, vann.length); k++) {
    const clusters = kMeansClustering(vann, k, 50);

    // Calculate total within-cluster sum of squares (WCSS)
    let wcss = 0;
    for (const cluster of clusters) {
      for (const member of cluster.members) {
        const dist = calculateDistance(
          member.latitude,
          member.longitude,
          cluster.centroid.latitude,
          cluster.centroid.longitude
        );
        wcss += dist * dist;
      }
    }

    scores.push({ k, score: wcss });
  }

  // Find elbow point (where rate of decrease slows significantly)
  let optimalK = 1;
  let maxImprovement = 0;

  for (let i = 1; i < scores.length - 1; i++) {
    const improvement = scores[i - 1].score - scores[i].score;
    const nextImprovement = scores[i].score - scores[i + 1].score;
    const improvementChange = improvement - nextImprovement;

    if (improvementChange > maxImprovement) {
      maxImprovement = improvementChange;
      optimalK = scores[i].k;
    }
  }

  return {
    k: optimalK,
    score: scores.find((s) => s.k === optimalK)?.score || 0,
    allScores: scores,
  };
}

// ============================================================================
// Per-Fylke Optimization
// ============================================================================

export interface FylkeClusterResult {
  fylke: string;
  clusters: ClusterResult[];
  totalVann: number;
  suggestedLPCount: number;
  currentLPCount: number;
  totalDistance: number;
  averageDistance: number;
}

/**
 * Run K-means optimization separately for each fylke
 * This is more practical than global optimization as it respects county boundaries
 * @param vann All vann markers (must have fylke field)
 * @param landingsplasser Existing landingsplasser (to count current per fylke)
 * @param clustersPerFylke Optional: specify clusters per fylke, or use auto-suggestion
 * @returns Optimization results grouped by fylke
 */
export function optimizeByFylke(
  vann: VannWithCoords[],
  landingsplasser: LandingsplassWithCoords[],
  clustersPerFylke?: Record<string, number>
): FylkeClusterResult[] {
  // Group vann by fylke
  const vannByFylke = new Map<string, VannWithCoords[]>();
  vann.forEach((v) => {
    const fylke = (v as any).fylke || 'Unknown';
    if (!vannByFylke.has(fylke)) {
      vannByFylke.set(fylke, []);
    }
    vannByFylke.get(fylke)!.push(v);
  });

  // Count existing LPs per fylke
  const lpCountByFylke = new Map<string, number>();
  landingsplasser.forEach((lp) => {
    const fylke = lp.fylke || 'Unknown';
    lpCountByFylke.set(fylke, (lpCountByFylke.get(fylke) || 0) + 1);
  });

  const results: FylkeClusterResult[] = [];

  // Optimize each fylke separately
  for (const [fylke, fylkeVann] of vannByFylke) {
    if (fylkeVann.length === 0) continue;

    // Determine number of clusters for this fylke
    let k: number;
    if (clustersPerFylke && clustersPerFylke[fylke]) {
      k = clustersPerFylke[fylke];
    } else {
      // Auto-suggest based on fylke size
      // Rule of thumb: 1 LP per 30-50 vann, minimum 2, maximum 15 per fylke
      const minK = 2;
      const maxK = Math.min(15, fylkeVann.length);
      const suggestedK = Math.max(minK, Math.min(maxK, Math.ceil(fylkeVann.length / 40)));
      k = suggestedK;
    }

    // Run clustering for this fylke
    const clusters = kMeansClustering(fylkeVann, k, 100);

    // Calculate statistics
    let totalDistance = 0;
    let totalMembers = 0;
    for (const cluster of clusters) {
      for (const member of cluster.members) {
        const dist = calculateDistance(
          member.latitude,
          member.longitude,
          cluster.centroid.latitude,
          cluster.centroid.longitude
        );
        totalDistance += dist;
        totalMembers++;
      }
    }

    results.push({
      fylke,
      clusters,
      totalVann: fylkeVann.length,
      suggestedLPCount: k,
      currentLPCount: lpCountByFylke.get(fylke) || 0,
      totalDistance,
      averageDistance: totalMembers > 0 ? totalDistance / totalMembers : 0,
    });
  }

  // Sort by fylke name
  results.sort((a, b) => a.fylke.localeCompare(b.fylke));

  return results;
}

/**
 * Calculate total improvement if per-fylke optimization is applied
 */
export function calculateFylkeOptimizationImpact(
  fylkeResults: FylkeClusterResult[],
  currentAssociations: Association[],
  vann: VannWithCoords[]
): {
  currentTotalDistance: number;
  optimizedTotalDistance: number;
  improvement: number;
  improvementPercent: number;
  lpCountChange: number;
} {
  // Current total distance
  const currentTotalDistance = currentAssociations
    .map((a) => a.distance_km || 0)
    .reduce((sum, d) => sum + d, 0);

  // Optimized total distance (from fylke results)
  const optimizedTotalDistance = fylkeResults
    .map((fr) => fr.totalDistance)
    .reduce((sum, d) => sum + d, 0);

  const improvement = currentTotalDistance - optimizedTotalDistance;
  const improvementPercent = currentTotalDistance > 0
    ? (improvement / currentTotalDistance) * 100
    : 0;

  const currentLPCount = fylkeResults
    .map((fr) => fr.currentLPCount)
    .reduce((sum, c) => sum + c, 0);

  const suggestedLPCount = fylkeResults
    .map((fr) => fr.suggestedLPCount)
    .reduce((sum, c) => sum + c, 0);

  return {
    currentTotalDistance,
    optimizedTotalDistance,
    improvement,
    improvementPercent,
    lpCountChange: suggestedLPCount - currentLPCount,
  };
}

// ============================================================================
// Flight Operations Calculations
// ============================================================================

export interface FlightOperationsConfig {
  bucketCapacity: number;      // Tons per trip (default: 1)
  bucketSpeed: number;          // Knots (default: 70)
  transitSpeed: number;         // Knots between LPs (default: 120)
  hoursPerDay: number;          // Flying hours per day (default: 4)
  daysPerWeek: number;          // Working days per week (default: 5)
}

export const DEFAULT_FLIGHT_CONFIG: FlightOperationsConfig = {
  bucketCapacity: 1,
  bucketSpeed: 70,
  transitSpeed: 120,
  hoursPerDay: 4,
  daysPerWeek: 5,
};

export interface LandingsplassWorkload {
  lpId: number;
  lpName: string;
  fylke?: string;
  totalTonnage: number;
  totalTrips: number;
  vannCount: number;
  totalBucketDistance: number;     // km (sum of: distance × trips for each vann)
  totalBucketFlightTime: number;   // hours
  estimatedDays: number;
  estimatedWeeks: number;
  vann: Array<{
    id: number;
    name: string | null;
    tonnage: number;
    distance: number;
    trips: number;
    bucketFlightTime: number;      // hours for this vann
  }>;
}

export interface FlightOperationsStats {
  config: FlightOperationsConfig;
  totalTonnage: number;
  totalTrips: number;
  totalBucketDistance: number;      // km (actual flying with buckets)
  totalBucketFlightTime: number;    // hours
  totalTransitDistance: number;     // km (between LPs)
  totalTransitFlightTime: number;   // hours
  totalFlightTime: number;          // hours (bucket + transit)
  estimatedDays: number;
  estimatedWeeks: number;
  landingsplasserWorkload: LandingsplassWorkload[];
}

/**
 * Parse tonnage from string or number, handling European decimal format
 */
function parseTonnage(tonn: string | number | undefined): number {
  if (!tonn) return 0;
  if (typeof tonn === 'number') return tonn;

  // Handle European format: "5,3" or "5.3"
  const cleaned = tonn.replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate comprehensive flight operations statistics
 * @param associations All associations with distance data
 * @param vann All vann markers with tonnage data
 * @param landingsplasser All landingsplasser
 * @param config Flight operations configuration
 * @returns Complete operational statistics
 */
export function calculateFlightOperations(
  associations: Association[],
  vann: VannWithCoords[],
  landingsplasser: LandingsplassWithCoords[],
  config: FlightOperationsConfig = DEFAULT_FLIGHT_CONFIG
): FlightOperationsStats {
  // Build map of vann ID to vann data
  const vannMap = new Map<number, VannWithCoords>();
  vann.forEach(v => vannMap.set(v.id, v));

  // Build map of LP ID to LP data
  const lpMap = new Map<number, LandingsplassWithCoords>();
  landingsplasser.forEach(lp => lpMap.set(lp.id, lp));

  // Group associations by landingsplass
  const assocByLP = new Map<number, Association[]>();
  associations.forEach(assoc => {
    if (!assocByLP.has(assoc.landingsplass_id)) {
      assocByLP.set(assoc.landingsplass_id, []);
    }
    assocByLP.get(assoc.landingsplass_id)!.push(assoc);
  });

  // Calculate workload for each landingsplass
  const landingsplasserWorkload: LandingsplassWorkload[] = [];
  let totalTonnage = 0;
  let totalTrips = 0;
  let totalBucketDistance = 0;
  let totalBucketFlightTime = 0;

  // Sort LPs by ID for consistent ordering
  const sortedLpIds = Array.from(assocByLP.keys()).sort((a, b) => a - b);

  for (const lpId of sortedLpIds) {
    const lpAssocs = assocByLP.get(lpId) || [];
    const lp = lpMap.get(lpId);

    // Skip if LP doesn't exist
    if (!lp) continue;

    // Skip if LP is inactive (deleted or deactivated)
    if (lp.is_active === false) continue;

    let lpTonnage = 0;
    let lpTrips = 0;
    let lpBucketDistance = 0;
    let lpBucketFlightTime = 0;
    const lpVannDetails: LandingsplassWorkload['vann'] = [];

    for (const assoc of lpAssocs) {
      const vannData = vannMap.get(assoc.airport_id);
      if (!vannData) continue;

      const tonnage = parseTonnage(vannData.tonn);
      const distance = assoc.distance_km || 0;
      const trips = Math.ceil(tonnage / config.bucketCapacity);

      // Each trip: fly to vann, fill bucket, fly back to LP
      const roundTripDistance = distance * 2;
      const bucketDistance = roundTripDistance * trips;

      // Flight time: distance (km) / speed (knots) * conversion
      // 1 knot = 1.852 km/h
      const bucketFlightTime = bucketDistance / (config.bucketSpeed * 1.852);

      lpTonnage += tonnage;
      lpTrips += trips;
      lpBucketDistance += bucketDistance;
      lpBucketFlightTime += bucketFlightTime;

      lpVannDetails.push({
        id: vannData.id,
        name: vannData.name,
        tonnage,
        distance,
        trips,
        bucketFlightTime,
      });
    }

    // Estimate days for this LP
    const lpEstimatedDays = lpBucketFlightTime / config.hoursPerDay;
    const lpEstimatedWeeks = lpEstimatedDays / config.daysPerWeek;

    landingsplasserWorkload.push({
      lpId: lp.id,
      lpName: lp.lp,
      fylke: lp.fylke,
      totalTonnage: lpTonnage,
      totalTrips: lpTrips,
      vannCount: lpAssocs.length,
      totalBucketDistance: lpBucketDistance,
      totalBucketFlightTime: lpBucketFlightTime,
      estimatedDays: lpEstimatedDays,
      estimatedWeeks: lpEstimatedWeeks,
      vann: lpVannDetails,
    });

    totalTonnage += lpTonnage;
    totalTrips += lpTrips;
    totalBucketDistance += lpBucketDistance;
    totalBucketFlightTime += lpBucketFlightTime;
  }

  // Calculate transit between LPs
  // Assumption: Helicopter visits LPs in order, flies between consecutive ones
  let totalTransitDistance = 0;
  const activeLPs = landingsplasserWorkload.map(w => lpMap.get(w.lpId)!).filter(lp => lp);

  for (let i = 0; i < activeLPs.length - 1; i++) {
    const lp1 = activeLPs[i];
    const lp2 = activeLPs[i + 1];
    if (lp1.latitude && lp1.longitude && lp2.latitude && lp2.longitude) {
      const transitDist = calculateDistance(
        lp1.latitude,
        lp1.longitude,
        lp2.latitude,
        lp2.longitude
      );
      totalTransitDistance += transitDist;
    }
  }

  const totalTransitFlightTime = totalTransitDistance / (config.transitSpeed * 1.852);
  const totalFlightTime = totalBucketFlightTime + totalTransitFlightTime;
  const estimatedDays = totalFlightTime / config.hoursPerDay;
  const estimatedWeeks = estimatedDays / config.daysPerWeek;

  return {
    config,
    totalTonnage,
    totalTrips,
    totalBucketDistance,
    totalBucketFlightTime,
    totalTransitDistance,
    totalTransitFlightTime,
    totalFlightTime,
    estimatedDays,
    estimatedWeeks,
    landingsplasserWorkload,
  };
}

/**
 * Compare flight operations between two years
 */
export function compareFlightOperations(
  year1Ops: FlightOperationsStats,
  year2Ops: FlightOperationsStats
): {
  totalFlightTimeDiff: number;
  totalFlightTimePercent: number;
  estimatedDaysDiff: number;
  estimatedWeeksDiff: number;
  tonnageDiff: number;
  tripsDiff: number;
  efficiencyImprovement: boolean;
} {
  const totalFlightTimeDiff = year2Ops.totalFlightTime - year1Ops.totalFlightTime;
  const totalFlightTimePercent = year1Ops.totalFlightTime > 0
    ? (totalFlightTimeDiff / year1Ops.totalFlightTime) * 100
    : 0;

  const estimatedDaysDiff = year2Ops.estimatedDays - year1Ops.estimatedDays;
  const estimatedWeeksDiff = year2Ops.estimatedWeeks - year1Ops.estimatedWeeks;
  const tonnageDiff = year2Ops.totalTonnage - year1Ops.totalTonnage;
  const tripsDiff = year2Ops.totalTrips - year1Ops.totalTrips;

  return {
    totalFlightTimeDiff,
    totalFlightTimePercent,
    estimatedDaysDiff,
    estimatedWeeksDiff,
    tonnageDiff,
    tripsDiff,
    efficiencyImprovement: totalFlightTimeDiff < 0,
  };
}

// ============================================================================
// Comparison Utilities
// ============================================================================

export interface YearComparison {
  year1: string;
  year2: string;
  stats1: OptimizationStats;
  stats2: OptimizationStats;
  distanceDifference: number;
  efficiencyChange: number; // Percentage change in average distance
  reassignedVann: Array<{
    vannId: number;
    vannName: string | null;
    year1Lp: string | null;
    year2Lp: string | null;
    distanceChange: number;
  }>;
}

/**
 * Compare two years' associations to identify changes and improvements
 */
export function compareYears(
  year1Data: {
    year: string;
    associations: Association[];
    landingsplasser: LandingsplassWithCoords[];
    vann: VannWithCoords[];
  },
  year2Data: {
    year: string;
    associations: Association[];
    landingsplasser: LandingsplassWithCoords[];
    vann: VannWithCoords[];
  }
): YearComparison {
  const stats1 = calculateOptimizationStats(
    year1Data.associations,
    year1Data.landingsplasser,
    year1Data.vann
  );

  const stats2 = calculateOptimizationStats(
    year2Data.associations,
    year2Data.landingsplasser,
    year2Data.vann
  );

  // Create maps for easy lookup
  const year1Map = new Map<number, { lpId: number; lpName: string; distance: number }>();
  const year2Map = new Map<number, { lpId: number; lpName: string; distance: number }>();

  year1Data.associations.forEach((assoc) => {
    const lp = year1Data.landingsplasser.find((l) => l.id === assoc.landingsplass_id);
    year1Map.set(assoc.airport_id, {
      lpId: assoc.landingsplass_id,
      lpName: lp?.lp || 'Unknown',
      distance: assoc.distance_km || 0,
    });
  });

  year2Data.associations.forEach((assoc) => {
    const lp = year2Data.landingsplasser.find((l) => l.id === assoc.landingsplass_id);
    year2Map.set(assoc.airport_id, {
      lpId: assoc.landingsplass_id,
      lpName: lp?.lp || 'Unknown',
      distance: assoc.distance_km || 0,
    });
  });

  // Find reassignments
  const reassignedVann: YearComparison['reassignedVann'] = [];
  const allVannIds = new Set([...year1Map.keys(), ...year2Map.keys()]);

  for (const vannId of allVannIds) {
    const y1 = year1Map.get(vannId);
    const y2 = year2Map.get(vannId);

    if (!y1 || !y2) continue; // Vann doesn't exist in both years

    if (y1.lpId !== y2.lpId) {
      const vann = year1Data.vann.find((v) => v.id === vannId) ||
                   year2Data.vann.find((v) => v.id === vannId);

      reassignedVann.push({
        vannId,
        vannName: vann?.name || null,
        year1Lp: y1.lpName,
        year2Lp: y2.lpName,
        distanceChange: y2.distance - y1.distance,
      });
    }
  }

  const distanceDifference = stats2.totalDistance - stats1.totalDistance;
  const efficiencyChange = stats1.averageDistance > 0
    ? ((stats2.averageDistance - stats1.averageDistance) / stats1.averageDistance) * 100
    : 0;

  return {
    year1: year1Data.year,
    year2: year2Data.year,
    stats1,
    stats2,
    distanceDifference,
    efficiencyChange,
    reassignedVann,
  };
}
