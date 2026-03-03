'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import {
  compareYears,
  calculateOptimizationStats,
  calculateFlightOperations,
  DEFAULT_FLIGHT_CONFIG,
  type LandingsplassWithCoords,
  type VannWithCoords,
  type Association,
  type YearComparison,
  type FlightOperationsStats,
  type FlightOperationsConfig,
} from '@/lib/optimizationUtils';
import { FlightOperationsReport } from './FlightOperationsReport';
import { ArrowRightLeft, TrendingUp, TrendingDown, Scale, Clock, Calendar, Plane, Loader2, AlertCircle, Info } from 'lucide-react';

interface YearComparisonTabProps {
  availableYears: Array<{ year: string; prefix: string; label: string }>;
  currentYear: string;
}

export function YearComparisonTab({ availableYears, currentYear }: YearComparisonTabProps) {
  const [year1, setYear1] = useState(currentYear);
  const [year2, setYear2] = useState('');
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<YearComparison | null>(null);

  const [year1Data, setYear1Data] = useState<{
    landingsplasser: LandingsplassWithCoords[];
    vann: VannWithCoords[];
    associations: Association[];
  } | null>(null);

  const [year2Data, setYear2Data] = useState<{
    landingsplasser: LandingsplassWithCoords[];
    vann: VannWithCoords[];
    associations: Association[];
  } | null>(null);

  const [flightOps1, setFlightOps1] = useState<FlightOperationsStats | null>(null);
  const [flightOps2, setFlightOps2] = useState<FlightOperationsStats | null>(null);
  const [flightConfig, setFlightConfig] = useState<FlightOperationsConfig>(DEFAULT_FLIGHT_CONFIG);

  // Load data for a specific year
  const loadYearData = async (year: string) => {
    // Find the selected year's configuration
    const selectedYear = availableYears.find(y => y.year === year);

    let lpTable: string;
    let vannTable: string;
    let assocTable: string;

    if (year === 'current' || !selectedYear) {
      // 'current' always means the unprefixed tables, regardless of what's active in app_config
      // This allows you to compare year archives against the original unprefixed tables
      lpTable = 'vass_lasteplass';
      vannTable = 'vass_vann';
      assocTable = 'vass_associations';
    } else {
      // For specific years, build the table name from the year and prefix
      const prefix = selectedYear.prefix;
      const suffix = prefix ? `${year}_${prefix}_` : `${year}_`;
      lpTable = `${suffix}vass_lasteplass`;
      vannTable = `${suffix}vass_vann`;
      assocTable = `${suffix}vass_associations`;
    }

    try {
      const [lpResult, vannResult, assocResult] = await Promise.all([
        supabase.from(lpTable).select('*').order('id'),
        supabase.from(vannTable).select('*').order('id'),
        supabase.from(assocTable).select('*'),
      ]);

      if (lpResult.error) throw lpResult.error;
      if (vannResult.error) throw vannResult.error;
      if (assocResult.error) throw assocResult.error;

      return {
        landingsplasser: lpResult.data as LandingsplassWithCoords[],
        vann: vannResult.data as VannWithCoords[],
        associations: assocResult.data as Association[],
      };
    } catch (error) {
      console.error(`Error loading data for year ${year}:`, error);
      throw error;
    }
  };

  // Run comparison
  const runComparison = async () => {
    if (!year1 || !year2) {
      alert('Please select both years to compare');
      return;
    }

    setLoading(true);
    try {
      const [data1, data2] = await Promise.all([
        loadYearData(year1),
        loadYearData(year2),
      ]);

      setYear1Data(data1);
      setYear2Data(data2);

      const comparisonResult = compareYears(
        { year: year1, ...data1 },
        { year: year2, ...data2 }
      );

      setComparison(comparisonResult);

      // Calculate flight operations for both years
      const ops1 = calculateFlightOperations(
        data1.associations,
        data1.vann,
        data1.landingsplasser,
        flightConfig
      );
      const ops2 = calculateFlightOperations(
        data2.associations,
        data2.vann,
        data2.landingsplasser,
        flightConfig
      );

      setFlightOps1(ops1);
      setFlightOps2(ops2);
    } catch (error) {
      console.error('Error running comparison:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when years change
  useEffect(() => {
    if (year1 && year2 && year1 !== year2) {
      runComparison();
    }
  }, [year1, year2]);

  // Recalculate flight operations when config changes
  const handleFlightConfigChange = (newConfig: FlightOperationsConfig) => {
    setFlightConfig(newConfig);

    // Recalculate if we have data
    if (year1Data && year2Data) {
      const ops1 = calculateFlightOperations(
        year1Data.associations,
        year1Data.vann,
        year1Data.landingsplasser,
        newConfig
      );
      const ops2 = calculateFlightOperations(
        year2Data.associations,
        year2Data.vann,
        year2Data.landingsplasser,
        newConfig
      );

      setFlightOps1(ops1);
      setFlightOps2(ops2);
    }
  };

  const year1Label = availableYears.find((y) => y.year === year1)?.label || year1;
  const year2Label = availableYears.find((y) => y.year === year2)?.label || year2;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Year-to-Year Comparison
          </CardTitle>
          <CardDescription>Compare landingsplass configurations and associations between different years</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Year Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mb-8">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Year 1 (Baseline)</Label>
              <Select value={year1} onValueChange={setYear1}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y.year} value={y.year}>
                      {y.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Year 2 (Comparison)</Label>
              <Select value={year2} onValueChange={setYear2}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears
                    .filter((y) => y.year !== year1)
                    .map((y) => (
                      <SelectItem key={y.year} value={y.year}>
                        {y.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={runComparison}
              disabled={!year1 || !year2 || year1 === year2 || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Compare Years
                </>
              )}
            </Button>
          </div>

          <Separator className="my-6" />

          {/* Flight Operations Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Plane className="w-5 h-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-900">Flight Operations Configuration</h3>
            </div>
            
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 mb-6 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-800 leading-relaxed">
                Adjust these parameters to update operational estimates. 
                Calculations assume round trips (LP → Vann → LP) for each required load.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bucketCapacity" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Bucket Capacity
                </Label>
                <div className="relative">
                  <Input
                    id="bucketCapacity"
                    type="number"
                    value={flightConfig.bucketCapacity}
                    onChange={(e) => handleFlightConfigChange({
                      ...flightConfig,
                      bucketCapacity: parseFloat(e.target.value) || 1
                    })}
                    step="0.1"
                    min="0.1"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-gray-400 pointer-events-none">tonn</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bucketSpeed" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Bucket Speed
                </Label>
                <div className="relative">
                  <Input
                    id="bucketSpeed"
                    type="number"
                    value={flightConfig.bucketSpeed}
                    onChange={(e) => handleFlightConfigChange({
                      ...flightConfig,
                      bucketSpeed: parseFloat(e.target.value) || 70
                    })}
                    step="5"
                    min="10"
                    className="pr-10"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-gray-400 pointer-events-none">kts</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transitSpeed" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Transit Speed
                </Label>
                <div className="relative">
                  <Input
                    id="transitSpeed"
                    type="number"
                    value={flightConfig.transitSpeed}
                    onChange={(e) => handleFlightConfigChange({
                      ...flightConfig,
                      transitSpeed: parseFloat(e.target.value) || 120
                    })}
                    step="5"
                    min="10"
                    className="pr-10"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-gray-400 pointer-events-none">kts</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hoursPerDay" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Hours / Day
                </Label>
                <div className="relative">
                  <Input
                    id="hoursPerDay"
                    type="number"
                    value={flightConfig.hoursPerDay}
                    onChange={(e) => handleFlightConfigChange({
                      ...flightConfig,
                      hoursPerDay: parseFloat(e.target.value) || 4
                    })}
                    step="0.5"
                    min="0.5"
                    max="24"
                    className="pr-10"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-gray-400 pointer-events-none">hrs</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="daysPerWeek" className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Days / Week
                </Label>
                <div className="relative">
                  <Input
                    id="daysPerWeek"
                    type="number"
                    value={flightConfig.daysPerWeek}
                    onChange={(e) => handleFlightConfigChange({
                      ...flightConfig,
                      daysPerWeek: parseInt(e.target.value) || 5
                    })}
                    step="1"
                    min="1"
                    max="7"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-gray-400 pointer-events-none">days</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {comparison && (
        <>
          {/* Summary Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Comparison Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Distance */}
                <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                  <div className="text-xs text-blue-600 mb-1 font-medium uppercase tracking-wide">{year1Label}</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {comparison.stats1.totalDistance.toFixed(1)} <span className="text-base font-normal text-blue-600">km</span>
                  </div>
                  <div className="text-xs text-blue-400 mt-2">Total Distance</div>
                </div>
                <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                  <div className="text-xs text-indigo-600 mb-1 font-medium uppercase tracking-wide">{year2Label}</div>
                  <div className="text-2xl font-bold text-indigo-900">
                    {comparison.stats2.totalDistance.toFixed(1)} <span className="text-base font-normal text-indigo-600">km</span>
                  </div>
                  <div className="text-xs text-indigo-400 mt-2">Total Distance</div>
                </div>

                {/* Change */}
                <div
                  className={`p-4 rounded-lg col-span-2 border flex flex-col justify-center ${
                    comparison.distanceDifference < 0 
                      ? 'bg-green-50 border-green-100' 
                      : 'bg-red-50 border-red-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Difference</div>
                    <div className={`flex items-center gap-1 text-sm font-bold ${
                      comparison.distanceDifference < 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {comparison.efficiencyChange > 0 ? '+' : ''}
                      {comparison.efficiencyChange.toFixed(1)}%
                      {comparison.distanceDifference < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    </div>
                  </div>
                  
                  <div
                    className={`text-3xl font-bold ${
                      comparison.distanceDifference < 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {comparison.distanceDifference > 0 ? '+' : ''}
                    {comparison.distanceDifference.toFixed(1)} <span className="text-lg font-normal">km</span>
                  </div>
                </div>
              </div>

              {/* Additional Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 pt-6 border-t">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Avg Distance</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {comparison.stats1.averageDistance.toFixed(2)} km
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{year1Label}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Avg Distance</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {comparison.stats2.averageDistance.toFixed(2)} km
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{year2Label}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Active LPs</div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold text-gray-900">
                      {comparison.stats1.numActiveLandingsplasser} → {comparison.stats2.numActiveLandingsplasser}
                    </div>
                    <div
                      className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        comparison.stats2.numActiveLandingsplasser < comparison.stats1.numActiveLandingsplasser
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {comparison.stats2.numActiveLandingsplasser - comparison.stats1.numActiveLandingsplasser > 0 ? '+' : ''}
                      {comparison.stats2.numActiveLandingsplasser - comparison.stats1.numActiveLandingsplasser}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Reassignments</div>
                  <div className="text-lg font-semibold text-gray-900">{comparison.reassignedVann.length}</div>
                  <div className="text-xs text-gray-400 mt-1">Changed assignments</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reassignments Table */}
          {comparison.reassignedVann.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Reassignments ({comparison.reassignedVann.length})</CardTitle>
                <CardDescription>Vann markers that were assigned to different landingsplasser between years</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0 z-10 text-gray-600">
                        <tr>
                          <th className="text-left p-3 font-medium">Vann</th>
                          <th className="text-left p-3 font-medium">{year1Label} LP</th>
                          <th className="text-left p-3 font-medium">{year2Label} LP</th>
                          <th className="text-right p-3 font-medium">Distance Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.reassignedVann
                          .sort((a, b) => Math.abs(b.distanceChange) - Math.abs(a.distanceChange))
                          .map((r) => (
                            <tr key={r.vannId} className="border-t hover:bg-gray-50 transition-colors">
                              <td className="p-3 font-medium">{r.vannName || `Vann #${r.vannId}`}</td>
                              <td className="p-3 text-gray-500">{r.year1Lp || '-'}</td>
                              <td className="p-3 text-blue-600 font-medium">{r.year2Lp || '-'}</td>
                              <td
                                className={`p-3 text-right font-bold ${
                                  r.distanceChange > 0 ? 'text-red-600' : 'text-green-600'
                                }`}
                              >
                                {r.distanceChange > 0 ? '+' : ''}
                                {r.distanceChange.toFixed(2)} km
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

          {/* Detailed Stats Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-blue-200 bg-blue-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-blue-700">{year1Label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-500">Total Distance</span>
                  <span className="font-semibold">{comparison.stats1.totalDistance.toFixed(1)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-500">Average Distance</span>
                  <span className="font-semibold">{comparison.stats1.averageDistance.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-500">Max Distance</span>
                  <span className="font-semibold">{comparison.stats1.maxDistance.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-500">Min Distance</span>
                  <span className="font-semibold">{comparison.stats1.minDistance.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-500">Active LPs</span>
                  <span className="font-semibold">{comparison.stats1.numActiveLandingsplasser}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-blue-100">
                  <span className="text-gray-500">Vann Markers</span>
                  <span className="font-semibold">{comparison.stats1.numVann}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Associations</span>
                  <span className="font-semibold">{comparison.stats1.numAssociations}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-indigo-200 bg-indigo-50/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-indigo-700">{year2Label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-indigo-100">
                  <span className="text-gray-500">Total Distance</span>
                  <span className="font-semibold">{comparison.stats2.totalDistance.toFixed(1)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-100">
                  <span className="text-gray-500">Average Distance</span>
                  <span className="font-semibold">{comparison.stats2.averageDistance.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-100">
                  <span className="text-gray-500">Max Distance</span>
                  <span className="font-semibold">{comparison.stats2.maxDistance.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-100">
                  <span className="text-gray-500">Min Distance</span>
                  <span className="font-semibold">{comparison.stats2.minDistance.toFixed(2)} km</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-100">
                  <span className="text-gray-500">Active LPs</span>
                  <span className="font-semibold">{comparison.stats2.numActiveLandingsplasser}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-indigo-100">
                  <span className="text-gray-500">Vann Markers</span>
                  <span className="font-semibold">{comparison.stats2.numVann}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Associations</span>
                  <span className="font-semibold">{comparison.stats2.numAssociations}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Flight Operations Comparison */}
          {flightOps1 && flightOps2 && (
            <>
              {/* Flight Operations Summary Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Flight Operations Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Year 1 Summary */}
                    <div className="bg-blue-50/50 p-5 rounded-lg border border-blue-100">
                      <h4 className="font-semibold text-lg mb-4 text-blue-700">{year1Label}</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Tonnage</span>
                          <span className="font-semibold">{flightOps1.totalTonnage.toFixed(1)} t</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Trips</span>
                          <span className="font-semibold">{flightOps1.totalTrips}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Flight Time</span>
                          <span className="font-semibold text-blue-700">{flightOps1.totalFlightTime.toFixed(1)} hrs</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-blue-200">
                          <span className="text-gray-600 font-medium">Estimated Days</span>
                          <span className="font-bold text-gray-900">{flightOps1.estimatedDays.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Estimated Weeks</span>
                          <span className="font-semibold">{flightOps1.estimatedWeeks.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Year 2 Summary */}
                    <div className="bg-indigo-50/50 p-5 rounded-lg border border-indigo-100">
                      <h4 className="font-semibold text-lg mb-4 text-indigo-700">{year2Label}</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Tonnage</span>
                          <span className="font-semibold">{flightOps2.totalTonnage.toFixed(1)} t</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Trips</span>
                          <span className="font-semibold">{flightOps2.totalTrips}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Flight Time</span>
                          <span className="font-semibold text-indigo-700">{flightOps2.totalFlightTime.toFixed(1)} hrs</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-indigo-200">
                          <span className="text-gray-600 font-medium">Estimated Days</span>
                          <span className="font-bold text-gray-900">{flightOps2.estimatedDays.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Estimated Weeks</span>
                          <span className="font-semibold">{flightOps2.estimatedWeeks.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Time Savings/Impact */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`p-4 rounded-lg border ${
                      flightOps2.totalFlightTime < flightOps1.totalFlightTime ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className="text-xs text-gray-500 mb-1 font-medium uppercase">Flight Time Difference</div>
                      <div className={`text-2xl font-bold ${
                        flightOps2.totalFlightTime < flightOps1.totalFlightTime ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {flightOps2.totalFlightTime - flightOps1.totalFlightTime > 0 ? '+' : ''}
                        {(flightOps2.totalFlightTime - flightOps1.totalFlightTime).toFixed(1)} hrs
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {((flightOps2.totalFlightTime / flightOps1.totalFlightTime - 1) * 100).toFixed(1)}% change
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg border ${
                      flightOps2.estimatedDays < flightOps1.estimatedDays ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className="text-xs text-gray-500 mb-1 font-medium uppercase">Time Savings</div>
                      <div className={`text-2xl font-bold ${
                        flightOps2.estimatedDays < flightOps1.estimatedDays ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {flightOps2.estimatedDays - flightOps1.estimatedDays > 0 ? '+' : ''}
                        {(flightOps2.estimatedDays - flightOps1.estimatedDays).toFixed(1)} days
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        ≈ {(flightOps2.estimatedWeeks - flightOps1.estimatedWeeks).toFixed(1)} weeks
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg border ${
                      flightOps2.totalBucketDistance < flightOps1.totalBucketDistance ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                    }`}>
                      <div className="text-xs text-gray-500 mb-1 font-medium uppercase">Bucket Dist Change</div>
                      <div className={`text-2xl font-bold ${
                        flightOps2.totalBucketDistance < flightOps1.totalBucketDistance ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {flightOps2.totalBucketDistance - flightOps1.totalBucketDistance > 0 ? '+' : ''}
                        {(flightOps2.totalBucketDistance - flightOps1.totalBucketDistance).toFixed(0)} km
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Total bucket flying distance
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Flight Operations Reports */}
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle>Detailed Flight Operations Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-lg font-semibold mb-4 text-blue-600 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> {year1Label}
                      </h4>
                      <FlightOperationsReport
                        operations={flightOps1}
                        year={year1Label}
                        onConfigChange={handleFlightConfigChange}
                      />
                    </div>

                    <div className="border-t xl:border-t-0 xl:border-l pt-8 xl:pt-0 xl:pl-8">
                      <h4 className="text-lg font-semibold mb-4 text-indigo-700 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> {year2Label}
                      </h4>
                      <FlightOperationsReport
                        operations={flightOps2}
                        year={year2Label}
                        onConfigChange={handleFlightConfigChange}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* No comparison yet */}
      {!comparison && !loading && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center flex flex-col items-center justify-center text-gray-400">
            <ArrowRightLeft className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-500">Select two different years to begin comparison</p>
            <p className="text-sm mt-2">Choose a baseline year and a comparison year from the dropdowns above.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
