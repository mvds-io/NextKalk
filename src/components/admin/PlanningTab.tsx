'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import {
  calculateDistance,
  findClosestLandingsplass,
  reassignVannFromDeactivatedLPs,
  calculateOptimizationStats,
  kMeansClustering,
  suggestOptimalK,
  compareYears,
  optimizeByFylke,
  calculateFylkeOptimizationImpact,
  type LandingsplassWithCoords,
  type VannWithCoords,
  type Association,
  type ReassignmentResult,
  type OptimizationStats,
  type ClusterResult,
  type FylkeClusterResult,
} from '@/lib/optimizationUtils';
import { OptimizationMapView } from './OptimizationMapView';
import { Play, CheckCircle, Save, AlertTriangle, BarChart3, Map as MapIcon, Sparkles, Wand2, Info } from 'lucide-react';

interface PlanningTabProps {
  tableNames: {
    vass_lasteplass: string;
    vass_vann: string;
    vass_associations: string;
  };
  userEmail: string;
}

interface PlanningScenario {
  id?: number;
  name: string;
  description: string;
  year: string;
  total_distance_km: number;
  average_distance_km: number;
  num_active_landingsplasser: number;
  num_vann: number;
  landingsplass_states: Record<string, { active: boolean; latitude: number; longitude: number }>;
  association_changes: any;
  optimization_metadata: any;
  created_at?: string;
  created_by?: string;
}

export function PlanningTab({ tableNames, userEmail }: PlanningTabProps) {
  // State
  const [landingsplasser, setLandingsplasser] = useState<LandingsplassWithCoords[]>([]);
  const [vann, setVann] = useState<VannWithCoords[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [loading, setLoading] = useState(true);

  // Planning mode state
  const [planningMode, setPlanningMode] = useState(false);
  const [deactivatedLpIds, setDeactivatedLpIds] = useState<Set<number>>(new Set());
  const [reassignments, setReassignments] = useState<ReassignmentResult[]>([]);
  const [currentStats, setCurrentStats] = useState<OptimizationStats | null>(null);
  const [plannedStats, setPlannedStats] = useState<OptimizationStats | null>(null);

  // Optimization state
  const [showOptimization, setShowOptimization] = useState(false);
  const [optimizationMode, setOptimizationMode] = useState<'global' | 'fylke'>('fylke');
  const [numClusters, setNumClusters] = useState(10);
  const [clusterResults, setClusterResults] = useState<ClusterResult[]>([]);
  const [fylkeResults, setFylkeResults] = useState<FylkeClusterResult[]>([]);
  const [suggestedK, setSuggestedK] = useState<number | null>(null);

  // Map visualization state
  const [showMap, setShowMap] = useState(true);
  const [mapMode, setMapMode] = useState<'current' | 'optimized' | 'comparison'>('current');

  // Scenario management
  const [scenarios, setScenarios] = useState<PlanningScenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<Partial<PlanningScenario>>({
    name: '',
    description: '',
  });
  const [showSaveScenario, setShowSaveScenario] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, [tableNames]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load active landingsplasser only (exclude deactivated ones from planning)
      const { data: lpData, error: lpError } = await supabase
        .from(tableNames.vass_lasteplass)
        .select('*')
        .eq('is_active', true)
        .order('id');

      if (lpError) throw lpError;

      // Load active vann only (exclude deactivated ones from planning)
      const { data: vannData, error: vannError } = await supabase
        .from(tableNames.vass_vann)
        .select('*')
        .eq('is_active', true)
        .order('id');

      if (vannError) throw vannError;

      // Load associations
      const { data: assocData, error: assocError } = await supabase
        .from(tableNames.vass_associations)
        .select('*');

      if (assocError) throw assocError;

      setLandingsplasser(lpData as LandingsplassWithCoords[]);
      setVann(vannData as VannWithCoords[]);
      setAssociations(assocData as Association[]);

      // Calculate initial stats
      const stats = calculateOptimizationStats(
        assocData as Association[],
        lpData as LandingsplassWithCoords[],
        vannData as VannWithCoords[]
      );
      setCurrentStats(stats);
      setPlannedStats(stats);

      // Load saved scenarios
      await loadScenarios();
    } catch (error) {
      console.error('Error loading planning data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScenarios = async () => {
    try {
      const { data, error } = await supabase
        .from('planning_scenarios')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setScenarios(data as PlanningScenario[]);
      }
    } catch (error) {
      console.error('Error loading scenarios:', error);
    }
  };

  // Toggle landingsplass activation
  const toggleLpActivation = useCallback((lpId: number) => {
    setDeactivatedLpIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(lpId)) {
        newSet.delete(lpId);
      } else {
        newSet.add(lpId);
      }
      return newSet;
    });
  }, []);

  // Recalculate when deactivations change
  useEffect(() => {
    if (!planningMode || deactivatedLpIds.size === 0) {
      setReassignments([]);
      setPlannedStats(currentStats);
      return;
    }

    // Calculate reassignments
    const newReassignments = reassignVannFromDeactivatedLPs(
      Array.from(deactivatedLpIds),
      vann,
      landingsplasser,
      associations
    );

    setReassignments(newReassignments);

    // Calculate new stats
    const updatedAssociations = associations.map((assoc) => {
      const reassignment = newReassignments.find((r) => r.vannId === assoc.airport_id);
      if (reassignment) {
        return {
          ...assoc,
          landingsplass_id: reassignment.newLpId!,
          distance_km: reassignment.newDistance,
        };
      }
      return assoc;
    });

    const activeLps = landingsplasser.map((lp) => ({
      ...lp,
      is_active_in_planning: !deactivatedLpIds.has(lp.id),
    }));

    const newStats = calculateOptimizationStats(updatedAssociations, activeLps, vann);
    setPlannedStats(newStats);
  }, [deactivatedLpIds, planningMode, associations, landingsplasser, vann, currentStats]);

  // Run K-means optimization
  const runOptimization = useCallback(() => {
    if (vann.length === 0) return;

    if (optimizationMode === 'global') {
      // Global optimization (old method)
      const clusters = kMeansClustering(vann, numClusters, 100);
      setClusterResults(clusters);
      setFylkeResults([]);
      setMapMode('optimized');
    } else {
      // Per-fylke optimization (new method)
      const fylkeOptimization = optimizeByFylke(vann, landingsplasser);
      setFylkeResults(fylkeOptimization);

      // Flatten all clusters for map view
      const allClusters = fylkeOptimization.flatMap(fr => fr.clusters);
      setClusterResults(allClusters);
      setMapMode('optimized');
    }
  }, [vann, numClusters, optimizationMode, landingsplasser]);

  // Suggest optimal K
  const findOptimalK = useCallback(() => {
    if (vann.length === 0) return;

    const result = suggestOptimalK(vann, 25);
    setSuggestedK(result.k);
    setNumClusters(result.k);
  }, [vann]);

  // Apply optimization suggestions
  const applyOptimizationSuggestions = useCallback(async () => {
    if (clusterResults.length === 0 && fylkeResults.length === 0) return;

    const totalLPs = optimizationMode === 'fylke'
      ? fylkeResults.reduce((sum, fr) => sum + fr.suggestedLPCount, 0)
      : clusterResults.length;

    const confirmMsg = `This will create ${totalLPs} new landingsplasser at the optimal cluster positions${optimizationMode === 'fylke' ? ' (grouped by fylke)' : ''}.\n\nAny existing landingsplasser will remain. You can manually deactivate old ones after reviewing.\n\nContinue?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      let newLPs: any[] = [];

      if (optimizationMode === 'fylke') {
        // Create LPs per fylke with fylke name
        fylkeResults.forEach((fylkeResult) => {
          fylkeResult.clusters.forEach((cluster, idx) => {
            newLPs.push({
              lp: `${fylkeResult.fylke}-OPT-${idx + 1}`,
              kode: `OPTIMIZED-${fylkeResult.fylke}-${idx + 1}`,
              latitude: cluster.centroid.latitude,
              longitude: cluster.centroid.longitude,
              fylke: fylkeResult.fylke,
              tonn_lp: cluster.totalTonnage,
              priority: 10,
              is_done: false,
              comment: `Auto-generated by per-fylke K-means optimization for ${fylkeResult.fylke}. ${cluster.members.length} vann, avg distance: ${cluster.averageDistance.toFixed(2)} km`,
              is_active_in_planning: true,
            });
          });
        });
      } else {
        // Global optimization
        newLPs = clusterResults.map((cluster, idx) => ({
          lp: `OPT-${idx + 1}`,
          kode: `OPTIMIZED-${idx + 1}`,
          latitude: cluster.centroid.latitude,
          longitude: cluster.centroid.longitude,
          fylke: null,
          tonn_lp: cluster.totalTonnage,
          priority: 10,
          is_done: false,
          comment: `Auto-generated by K-means optimization. ${cluster.members.length} vann, avg distance: ${cluster.averageDistance.toFixed(2)} km`,
          is_active_in_planning: true,
        }));
      }

      const { data: createdLPs, error: createError } = await supabase
        .from(tableNames.vass_lasteplass)
        .insert(newLPs)
        .select();

      if (createError) throw createError;

      alert(`Created ${createdLPs.length} optimized landingsplasser!\n\nPlease review and manually reassign vann markers to these new locations in the Landingsplasser or Vann tabs.`);

      // Reload data
      await loadData();
    } catch (error) {
      console.error('Error applying optimization:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [clusterResults, fylkeResults, optimizationMode, tableNames, loadData]);

  // Save current planning state as scenario
  const saveScenario = useCallback(async () => {
    if (!currentScenario.name) {
      alert('Please enter a scenario name');
      return;
    }

    try {
      // Build landingsplass states
      const lpStates: Record<string, any> = {};
      landingsplasser.forEach((lp) => {
        lpStates[lp.id.toString()] = {
          active: !deactivatedLpIds.has(lp.id),
          latitude: lp.latitude,
          longitude: lp.longitude,
          lp: lp.lp,
        };
      });

      const scenario: Partial<PlanningScenario> = {
        name: currentScenario.name,
        description: currentScenario.description || '',
        year: tableNames.vass_lasteplass.replace('_vass_lasteplass', '') || 'current',
        total_distance_km: plannedStats?.totalDistance || 0,
        average_distance_km: plannedStats?.averageDistance || 0,
        num_active_landingsplasser: plannedStats?.numActiveLandingsplasser || 0,
        num_vann: plannedStats?.numVann || 0,
        landingsplass_states: lpStates,
        association_changes: reassignments.map((r) => ({
          vann_id: r.vannId,
          vann_name: r.vannName,
          old_lp: r.oldLpId,
          new_lp: r.newLpId,
          distance_change: r.distanceChange,
        })),
        optimization_metadata: {
          deactivated_count: deactivatedLpIds.size,
          total_reassignments: reassignments.length,
        },
        created_by: userEmail,
      };

      const { error } = await supabase
        .from('planning_scenarios')
        .insert([scenario]);

      if (error) throw error;

      alert('Scenario saved successfully!');
      setShowSaveScenario(false);
      setCurrentScenario({ name: '', description: '' });
      await loadScenarios();
    } catch (error) {
      console.error('Error saving scenario:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [currentScenario, landingsplasser, deactivatedLpIds, plannedStats, reassignments, tableNames, userEmail]);

  // Load a saved scenario
  const loadScenario = useCallback((scenario: PlanningScenario) => {
    const deactivated = new Set<number>();
    Object.entries(scenario.landingsplass_states).forEach(([lpId, state]) => {
      if (!state.active) {
        deactivated.add(parseInt(lpId));
      }
    });
    setDeactivatedLpIds(deactivated);
    setPlanningMode(true);
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading planning data...</div>;
  }

  const activeLandingsplasser = landingsplasser.filter((lp) => !deactivatedLpIds.has(lp.id));
  const distanceChange = plannedStats && currentStats
    ? plannedStats.totalDistance - currentStats.totalDistance
    : 0;
  const percentChange = currentStats?.totalDistance
    ? (distanceChange / currentStats.totalDistance) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with Planning Mode Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Landingsplass Optimization & Planning</CardTitle>
              <CardDescription>Optimize landingsplass placement and test different configurations</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant={planningMode ? 'default' : 'outline'}
                onClick={() => {
                  setPlanningMode(!planningMode);
                  if (!planningMode) {
                    setDeactivatedLpIds(new Set());
                  }
                }}
                className={planningMode ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {planningMode ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Planning Mode Active
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Enter Planning Mode
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Current Stats */}
          {currentStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg">
                <div className="text-sm text-blue-700 mb-1 font-medium">Total Distance</div>
                <div className="text-2xl font-bold text-blue-900">
                  {currentStats.totalDistance.toFixed(1)} km
                </div>
              </div>
              <div className="bg-green-50/50 border border-green-100 p-4 rounded-lg">
                <div className="text-sm text-green-700 mb-1 font-medium">Average Distance</div>
                <div className="text-2xl font-bold text-green-900">
                  {currentStats.averageDistance.toFixed(2)} km
                </div>
              </div>
              <div className="bg-purple-50/50 border border-purple-100 p-4 rounded-lg">
                <div className="text-sm text-purple-700 mb-1 font-medium">Active LPs</div>
                <div className="text-2xl font-bold text-purple-900">
                  {currentStats.numActiveLandingsplasser}
                </div>
              </div>
              <div className="bg-orange-50/50 border border-orange-100 p-4 rounded-lg">
                <div className="text-sm text-orange-700 mb-1 font-medium">Vann Markers</div>
                <div className="text-2xl font-bold text-orange-900">
                  {currentStats.numVann}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map Visualization */}
      {showMap && (
        <OptimizationMapView
          vann={vann}
          currentLandingsplasser={landingsplasser}
          optimizedClusters={clusterResults.length > 0 ? clusterResults : undefined}
          deactivatedLpIds={deactivatedLpIds}
          showMode={mapMode}
        />
      )}

      {/* Planning Mode Active */}
      {planningMode && (
        <>
          {/* Landingsplass Activation/Deactivation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>
                  Landingsplass Activation ({activeLandingsplasser.length}/{landingsplasser.length} active)
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeactivatedLpIds(new Set())}
                  >
                    Activate All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (reassignments.length > 0 && window.confirm('Save this planning scenario?')) {
                        setShowSaveScenario(true);
                      }
                    }}
                    disabled={reassignments.length === 0}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Scenario
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-2">
                {landingsplasser.map((lp) => {
                  const isActive = !deactivatedLpIds.has(lp.id);
                  const affectedVann = reassignments.filter((r) => r.oldLpId === lp.id);

                  return (
                    <div
                      key={lp.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? 'bg-green-50/50 border-green-200 hover:bg-green-100/50'
                          : 'bg-red-50/50 border-red-200 hover:bg-red-100/50'
                      }`}
                      onClick={() => toggleLpActivation(lp.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox checked={isActive} className={isActive ? "data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600" : ""} />
                          <div>
                            <div className="font-semibold text-sm">{lp.lp}</div>
                            <div className="text-xs text-muted-foreground">
                              {lp.kode || 'No code'} • {lp.fylke || 'Unknown'}
                            </div>
                          </div>
                        </div>
                        {!isActive && affectedVann.length > 0 && (
                          <Badge variant="destructive" className="text-xs px-2 py-0.5">
                            {affectedVann.length} vann
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Impact Analysis */}
          {reassignments.length > 0 && plannedStats && (
            <Card>
              <CardHeader>
                <CardTitle>Impact Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className={`p-4 rounded-lg border ${distanceChange > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                    <div className="text-sm text-gray-600 mb-1 font-medium">Distance Change</div>
                    <div className={`text-2xl font-bold ${distanceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {distanceChange > 0 ? '+' : ''}{distanceChange.toFixed(1)} km
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1 font-medium">New Avg Distance</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {plannedStats.averageDistance.toFixed(2)} km
                    </div>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg">
                    <div className="text-sm text-orange-700 mb-1 font-medium">Reassignments</div>
                    <div className="text-2xl font-bold text-orange-900">
                      {reassignments.length}
                    </div>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg">
                    <div className="text-sm text-purple-700 mb-1 font-medium">Deactivated LPs</div>
                    <div className="text-2xl font-bold text-purple-900">
                      {deactivatedLpIds.size}
                    </div>
                  </div>
                </div>

                {/* Reassignments Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="text-left p-3 font-semibold text-gray-700">Vann</th>
                          <th className="text-left p-3 font-semibold text-gray-700">Old LP</th>
                          <th className="text-left p-3 font-semibold text-gray-700">New LP</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Old Dist</th>
                          <th className="text-right p-3 font-semibold text-gray-700">New Dist</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reassignments.map((r) => (
                          <tr key={r.vannId} className="border-t hover:bg-gray-50 transition-colors">
                            <td className="p-3 font-medium">{r.vannName || `Vann #${r.vannId}`}</td>
                            <td className="p-3 text-gray-600">
                              {landingsplasser.find((lp) => lp.id === r.oldLpId)?.lp || '-'}
                            </td>
                            <td className="p-3 font-medium text-blue-600">{r.newLpName}</td>
                            <td className="p-3 text-right text-gray-600">{r.oldDistance.toFixed(2)} km</td>
                            <td className="p-3 text-right font-medium">{r.newDistance.toFixed(2)} km</td>
                            <td className={`p-3 text-right font-bold ${
                              r.distanceChange > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {r.distanceChange > 0 ? '+' : ''}{r.distanceChange.toFixed(2)} km
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* K-Means Optimization */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                K-Means Optimization
              </CardTitle>
              <CardDescription>Find optimal landingsplass positions using clustering algorithms</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowOptimization(!showOptimization)}
            >
              {showOptimization ? 'Hide' : 'Show'} Optimization
            </Button>
          </div>
        </CardHeader>

        {showOptimization && (
          <CardContent className="space-y-6">
            {/* Optimization Mode Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  optimizationMode === 'fylke'
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                }`}
                onClick={() => setOptimizationMode('fylke')}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    optimizationMode === 'fylke' ? 'border-blue-600' : 'border-gray-400'
                  }`}>
                    {optimizationMode === 'fylke' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      Per-Fylke Optimization
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200 text-[10px]">Recommended</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Optimizes each county separately. More practical for real-world logistics and administrative boundaries.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  optimizationMode === 'global'
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                }`}
                onClick={() => setOptimizationMode('global')}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    optimizationMode === 'global' ? 'border-blue-600' : 'border-gray-400'
                  }`}>
                    {optimizationMode === 'global' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Global Optimization</div>
                    <p className="text-sm text-gray-500 mt-1">
                      Optimizes across the entire map, ignoring county boundaries. Good for theoretical minimum distance.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t">
              {optimizationMode === 'global' && (
                <div className="space-y-2">
                  <Label>Number of Clusters (LPs)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={numClusters}
                      onChange={(e) => setNumClusters(parseInt(e.target.value) || 1)}
                    />
                    <Button onClick={findOptimalK} variant="outline" size="sm">
                      Auto
                    </Button>
                  </div>
                  {suggestedK && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Suggested: {suggestedK} clusters (elbow method)
                    </p>
                  )}
                </div>
              )}
              {optimizationMode === 'fylke' && (
                <div className="space-y-2">
                  <Label>Configuration</Label>
                  <div className="p-3 bg-blue-50 rounded border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>Automatic per-fylke clustering will determine optimal cluster counts for each region.</p>
                  </div>
                </div>
              )}
              <div className="flex items-end">
                <Button onClick={runOptimization} className="w-full gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Run Optimization
                </Button>
              </div>
              {clusterResults.length > 0 && (
                <div className="flex items-end">
                  <Button onClick={applyOptimizationSuggestions} className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                    <Wand2 className="w-4 h-4" />
                    Create Optimized LPs
                  </Button>
                </div>
              )}
            </div>

            {/* Per-Fylke Results */}
            {fylkeResults.length > 0 && optimizationMode === 'fylke' && (
              <div className="space-y-4 mt-6">
                <h4 className="font-semibold text-lg text-gray-900">Optimization Results by Fylke</h4>
                <div className="grid grid-cols-1 gap-6">
                  {fylkeResults.map((fylkeResult) => (
                    <Card key={fylkeResult.fylke} className="overflow-hidden border-gray-200">
                      <div className="bg-gray-50 p-4 border-b flex flex-wrap justify-between items-center gap-4">
                        <h5 className="font-semibold text-base">{fylkeResult.fylke}</h5>
                        <div className="flex gap-4 text-sm text-gray-600">
                          <div className="bg-white px-2 py-1 rounded border">
                            Vann: <span className="font-semibold text-gray-900">{fylkeResult.totalVann}</span>
                          </div>
                          <div className="bg-white px-2 py-1 rounded border">
                            Current LPs: <span className="font-semibold text-gray-900">{fylkeResult.currentLPCount}</span>
                          </div>
                          <div className="bg-green-50 px-2 py-1 rounded border border-green-100">
                            Suggested: <span className="font-bold text-green-700">{fylkeResult.suggestedLPCount}</span>
                          </div>
                          <div className="bg-white px-2 py-1 rounded border">
                            Avg Dist: <span className="font-semibold text-gray-900">{fylkeResult.averageDistance.toFixed(2)} km</span>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100/50 text-gray-500">
                            <tr>
                              <th className="text-left p-3 font-medium">LP ID</th>
                              <th className="text-left p-3 font-medium">Position</th>
                              <th className="text-right p-3 font-medium">Members</th>
                              <th className="text-right p-3 font-medium">Tonnage</th>
                              <th className="text-right p-3 font-medium">Avg Dist</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fylkeResult.clusters.map((cluster, idx) => (
                              <tr key={idx} className="border-t hover:bg-gray-50/50 transition-colors">
                                <td className="p-3 font-medium text-blue-600">{fylkeResult.fylke}-OPT-{idx + 1}</td>
                                <td className="p-3 font-mono text-xs text-gray-500">
                                  {cluster.centroid.latitude.toFixed(4)}, {cluster.centroid.longitude.toFixed(4)}
                                </td>
                                <td className="p-3 text-right">{cluster.members.length}</td>
                                <td className="p-3 text-right">{cluster.totalTonnage.toFixed(1)} t</td>
                                <td className="p-3 text-right">{cluster.averageDistance.toFixed(2)} km</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Global Cluster Results */}
            {clusterResults.length > 0 && optimizationMode === 'global' && (
              <div className="border rounded-lg overflow-hidden mt-6">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Position</th>
                      <th className="text-right p-3 font-medium">Members</th>
                      <th className="text-right p-3 font-medium">Total Tonnage</th>
                      <th className="text-right p-3 font-medium">Avg Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterResults.map((cluster, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-medium text-blue-600">OPT-{idx + 1}</td>
                        <td className="p-3 font-mono text-xs text-gray-500">
                          {cluster.centroid.latitude.toFixed(4)}, {cluster.centroid.longitude.toFixed(4)}
                        </td>
                        <td className="p-3 text-right">{cluster.members.length}</td>
                        <td className="p-3 text-right">{cluster.totalTonnage.toFixed(1)} t</td>
                        <td className="p-3 text-right">{cluster.averageDistance.toFixed(2)} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Saved Scenarios */}
      {scenarios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Scenarios ({scenarios.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenarios.map((scenario) => (
                <Card key={scenario.id} className="border hover:border-blue-300 transition-all cursor-default bg-white/50 hover:bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-bold text-gray-900">{scenario.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{scenario.description}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadScenario(scenario)}
                        className="shrink-0"
                      >
                        Load
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
                        <div className="text-xs text-gray-500">Total Dist</div>
                        <div className="font-semibold text-blue-700">{scenario.total_distance_km?.toFixed(1)} km</div>
                      </div>
                      <div className="bg-green-50/50 p-2 rounded border border-green-100">
                        <div className="text-xs text-gray-500">Avg Dist</div>
                        <div className="font-semibold text-green-700">{scenario.average_distance_km?.toFixed(2)} km</div>
                      </div>
                      <div className="bg-purple-50/50 p-2 rounded border border-purple-100">
                        <div className="text-xs text-gray-500">Active LPs</div>
                        <div className="font-semibold text-purple-700">{scenario.num_active_landingsplasser}</div>
                      </div>
                      <div className="bg-orange-50/50 p-2 rounded border border-orange-100">
                        <div className="text-xs text-gray-500">Year</div>
                        <div className="font-semibold text-orange-700">{scenario.year}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Scenario Dialog */}
      {showSaveScenario && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-xl">
            <CardHeader>
              <CardTitle>Save Planning Scenario</CardTitle>
              <CardDescription>Save your current configuration to revisit later.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scenario-name">Scenario Name *</Label>
                <Input
                  id="scenario-name"
                  value={currentScenario.name || ''}
                  onChange={(e) => setCurrentScenario({ ...currentScenario, name: e.target.value })}
                  placeholder="e.g., Reduced LPs - North Region"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scenario-desc">Description</Label>
                <Textarea
                  id="scenario-desc"
                  value={currentScenario.description || ''}
                  onChange={(e) => setCurrentScenario({ ...currentScenario, description: e.target.value })}
                  placeholder="Optional notes about this scenario..."
                  rows={3}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveScenario(false)}>
                Cancel
              </Button>
              <Button onClick={saveScenario}>
                Save Scenario
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
