'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Clock, Calendar, Plane, Weight, Route } from 'lucide-react';
import type {
  FlightOperationsStats,
  FlightOperationsConfig,
} from '@/lib/optimizationUtils';

interface FlightOperationsReportProps {
  operations: FlightOperationsStats;
  year: string;
  onConfigChange?: (config: FlightOperationsConfig) => void;
}

export function FlightOperationsReport({
  operations,
  year,
}: FlightOperationsReportProps) {
  const [showLPDetails, setShowLPDetails] = useState(false);

  const formatHours = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    return `${hours.toFixed(1)} hrs`;
  };

  const formatDays = (days: number): string => {
    if (days < 1) return `${Math.round(days * 24)} hrs`;
    return `${days.toFixed(1)} days`;
  };

  const formatWeeks = (weeks: number): string => {
    if (weeks < 1) return `${formatDays(weeks * 5)}`;
    return `${weeks.toFixed(1)} weeks`;
  };

  return (
    <div className="space-y-6">

      {/* Summary Statistics */}
      <div>
        <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Overall Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-blue-50/50 border-blue-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-700 mb-2">
                <Weight className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Total Tonnage</span>
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {operations.totalTonnage.toFixed(1)} <span className="text-base font-normal text-blue-700">t</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50/50 border-green-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <Plane className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Total Trips</span>
              </div>
              <div className="text-2xl font-bold text-green-900">
                {operations.totalTrips}
              </div>
              <div className="text-xs text-green-600 mt-1">
                ({operations.config.bucketCapacity}t/trip)
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50/50 border-purple-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-700 mb-2">
                <Route className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Bucket Dist</span>
              </div>
              <div className="text-2xl font-bold text-purple-900">
                {operations.totalBucketDistance.toFixed(0)} <span className="text-base font-normal text-purple-700">km</span>
              </div>
              <div className="text-xs text-purple-600 mt-1">
                @ {operations.config.bucketSpeed} kts
              </div>
            </CardContent>
          </Card>

          <Card className="bg-orange-50/50 border-orange-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-orange-700 mb-2">
                <Route className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Transit Dist</span>
              </div>
              <div className="text-2xl font-bold text-orange-900">
                {operations.totalTransitDistance.toFixed(0)} <span className="text-base font-normal text-orange-700">km</span>
              </div>
              <div className="text-xs text-orange-600 mt-1">
                @ {operations.config.transitSpeed} kts
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Time Estimates */}
      <div>
        <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Time Estimates</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="border-l-4 border-blue-500 pl-4 py-1">
            <div className="text-sm text-gray-500 mb-1">Bucket Flight Time</div>
            <div className="text-xl font-bold text-gray-900">
              {formatHours(operations.totalBucketFlightTime)}
            </div>
            <div className="text-xs text-gray-400">Flying with buckets</div>
          </div>
          <div className="border-l-4 border-orange-500 pl-4 py-1">
            <div className="text-sm text-gray-500 mb-1">Transit Time</div>
            <div className="text-xl font-bold text-gray-900">
              {formatHours(operations.totalTransitFlightTime)}
            </div>
            <div className="text-xs text-gray-400">Between landingsplasser</div>
          </div>
          <div className="border-l-4 border-green-500 pl-4 py-1">
            <div className="text-sm text-gray-500 mb-1">Total Flight Time</div>
            <div className="text-xl font-bold text-gray-900">
              {formatHours(operations.totalFlightTime)}
            </div>
            <div className="text-xs text-gray-400">All flying</div>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-100">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-green-800 mb-2">
                  <Calendar className="w-5 h-5" />
                  <span className="font-semibold">Estimated Completion Time</span>
                </div>
                <div className="text-4xl font-bold text-green-900 mb-2">
                  {formatWeeks(operations.estimatedWeeks)}
                </div>
                <div className="text-sm text-green-700 bg-white/50 px-2 py-1 rounded inline-block">
                  ≈ {formatDays(operations.estimatedDays)} active work days
                </div>
                <div className="text-xs text-green-600 mt-2">
                  Based on {operations.config.hoursPerDay} hrs/day, {operations.config.daysPerWeek} days/week
                </div>
              </div>
              <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-green-200 md:pl-6 pt-4 md:pt-0">
                <div className="text-sm text-gray-600 mb-1">Calendar Estimate</div>
                <div className="text-xl font-semibold text-gray-900">
                  {Math.ceil(operations.estimatedDays / operations.config.daysPerWeek * 7)} calendar days
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Including weekends and non-flying days
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Landingsplass Workload */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Per-Landingsplass Workload</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLPDetails(!showLPDetails)}
              className="gap-2"
            >
              {showLPDetails ? (
                <>Hide Details <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Show Details <ChevronDown className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead>LP</TableHead>
                  <TableHead>Fylke</TableHead>
                  <TableHead className="text-right">Vann</TableHead>
                  <TableHead className="text-right">Tonnage</TableHead>
                  <TableHead className="text-right">Trips</TableHead>
                  <TableHead className="text-right">Flight Time</TableHead>
                  <TableHead className="text-right">Est. Days</TableHead>
                  <TableHead className="text-right">Est. Weeks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.landingsplasserWorkload
                  .sort((a, b) => b.totalBucketFlightTime - a.totalBucketFlightTime)
                  .map((lp) => (
                    <React.Fragment key={lp.lpId}>
                      <TableRow className="hover:bg-gray-50">
                        <TableCell className="font-medium">{lp.lpName}</TableCell>
                        <TableCell className="text-muted-foreground">{lp.fylke || '-'}</TableCell>
                        <TableCell className="text-right">{lp.vannCount}</TableCell>
                        <TableCell className="text-right">{lp.totalTonnage.toFixed(1)} t</TableCell>
                        <TableCell className="text-right">{lp.totalTrips}</TableCell>
                        <TableCell className="text-right font-medium text-blue-600">{formatHours(lp.totalBucketFlightTime)}</TableCell>
                        <TableCell className="text-right">{lp.estimatedDays.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{lp.estimatedWeeks.toFixed(1)}</TableCell>
                      </TableRow>
                      {showLPDetails && lp.vann.length > 0 && (
                        <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                          <TableCell colSpan={8} className="p-4">
                            <div className="rounded-lg border bg-white p-4">
                              <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                Vann Details for {lp.lpName}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {lp.vann
                                  .sort((a, b) => b.bucketFlightTime - a.bucketFlightTime)
                                  .map((v) => (
                                    <div key={v.id} className="text-xs p-3 rounded border bg-gray-50/30 hover:bg-gray-50 transition-colors">
                                      <div className="font-medium text-gray-900 mb-1">{v.name || `Vann #${v.id}`}</div>
                                      <div className="flex justify-between text-gray-600 mb-1">
                                        <span>{v.tonnage.toFixed(1)}t</span>
                                        <span>{v.trips} trips</span>
                                      </div>
                                      <div className="flex justify-between text-gray-500">
                                        <span>{v.distance.toFixed(1)} km dist</span>
                                        <span className="font-medium text-blue-600">{formatHours(v.bucketFlightTime)}</span>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
              </TableBody>
              <TableBody>
                <TableRow className="bg-gray-100 hover:bg-gray-100 font-semibold border-t-2 border-gray-200">
                  <TableCell colSpan={2}>TOTAL</TableCell>
                  <TableCell className="text-right">{operations.landingsplasserWorkload.reduce((sum, lp) => sum + lp.vannCount, 0)}</TableCell>
                  <TableCell className="text-right">{operations.totalTonnage.toFixed(1)} t</TableCell>
                  <TableCell className="text-right">{operations.totalTrips}</TableCell>
                  <TableCell className="text-right">{formatHours(operations.totalBucketFlightTime)}</TableCell>
                  <TableCell className="text-right">{operations.estimatedDays.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{operations.estimatedWeeks.toFixed(1)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Flight Time Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                Bucket Flying ({((operations.totalBucketFlightTime / operations.totalFlightTime) * 100).toFixed(1)}%)
              </span>
              <span className="font-medium">{formatHours(operations.totalBucketFlightTime)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(operations.totalBucketFlightTime / operations.totalFlightTime) * 100}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                Transit Between LPs ({((operations.totalTransitFlightTime / operations.totalFlightTime) * 100).toFixed(1)}%)
              </span>
              <span className="font-medium">{formatHours(operations.totalTransitFlightTime)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-orange-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(operations.totalTransitFlightTime / operations.totalFlightTime) * 100}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
