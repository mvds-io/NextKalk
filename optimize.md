# Code Optimization and Refactoring Plan

## Current State Analysis

### Component Size Issues
- **MapContainer.tsx**: 3,014 lines - Extremely large, handles too many responsibilities
- **ProgressPlan.tsx**: 924 lines - Should be broken down
- **Counter.tsx**: 721 lines - Contains mixed concerns
- **AuthGuard.tsx**: 416 lines
- **UserLogsModal.tsx**: 380 lines

## Key Problems Identified

### 1. Massive Component Size
The MapContainer component is handling:
- Map initialization and lifecycle
- Marker management
- Connection lines
- Popup content generation
- Image/document loading
- GPX export
- User permissions
- Mobile detection
- Satellite view toggle
- Route planning
- Database operations

This violates the Single Responsibility Principle and makes the code difficult to maintain.

### 2. Mixed Concerns
- Business logic, UI rendering, data fetching, and state management are all mixed within single components
- No separation between presentation and logic layers
- Direct Leaflet manipulation mixed with React component logic
- Database queries embedded in components

### 3. Missing Abstraction Layers
- No custom hooks for reusable logic
- No service layer for API/database operations
- No utility functions for common operations
- Duplicate code across components
- No centralized error handling

### 4. Type Safety Issues
- Heavy use of `any` types, especially for Leaflet objects:
  ```typescript
  const leafletMapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const clusterGroupRef = useRef<any>(null);
  ```
- Loose typing with `Record<string, unknown>`
- Missing proper type definitions for complex objects
- Type assertions without validation

### 5. Performance Concerns
- Large inline functions recreated on every render
- Missing proper memoization for expensive computations
- No code splitting for large components
- All Leaflet code loaded upfront
- Inefficient re-renders due to state management

### 6. State Management Issues
- Props drilling through multiple component levels
- No centralized state management
- Local state scattered across components
- Duplicate state in multiple places

## Recommended Refactoring Plan

### Phase 1: Create Core Infrastructure

#### 1.1 Custom Hooks (`src/hooks/`)
Create reusable hooks to extract logic from components:

- **useMapManager** - Handle map initialization and lifecycle
  - Initialize Leaflet map
  - Manage map events
  - Handle resize events
  - Control map view state

- **useMarkerManager** - Manage marker operations
  - Create/update/delete markers
  - Handle marker clustering
  - Manage marker popups
  - Filter markers by criteria

- **useConnectionManager** - Handle connection lines
  - Show/hide all connections
  - Show individual connections
  - Manage connection line styles
  - Calculate connection paths

- **usePermissions** - User permissions logic
  - Load user permissions
  - Check permission levels
  - Provide permission helpers

- **useMobileDetection** - Mobile/tablet detection logic
  - Detect device type
  - Handle responsive behavior
  - Manage mobile-specific UI state

- **useDataFetching** - Centralized data fetching
  - Fetch airports, landingsplasser, kalk markers
  - Handle loading states
  - Implement retry logic
  - Cache management

#### 1.2 Services Layer (`src/services/`)
Extract business logic into service classes:

- **MapService**
  - Leaflet operations abstraction
  - Map initialization
  - Layer management
  - Event handling

- **DataService**
  - Supabase queries
  - Data transformation
  - Batch operations
  - Query optimization

- **ExportService**
  - GPX export functionality
  - PDF generation
  - Data formatting for export

- **ImageService**
  - Image loading operations
  - Document management
  - Thumbnail generation
  - Caching strategy

- **AuthService**
  - Authentication operations
  - Token management
  - User session handling

#### 1.3 Utilities (`src/utils/`)
Create utility functions for common operations:

- **formatters.ts**
  ```typescript
  export const formatDate = (date: string) => {...}
  export const formatTonnage = (tonn: number) => {...}
  export const formatCoordinates = (lat: number, lng: number) => {...}
  ```

- **validators.ts**
  ```typescript
  export const isValidCoordinate = (lat: number, lng: number) => {...}
  export const validateAirport = (airport: unknown) => {...}
  ```

- **mapHelpers.ts**
  ```typescript
  export const createMarkerIcon = (type: MarkerType, color: string) => {...}
  export const calculateDistance = (point1: Coordinates, point2: Coordinates) => {...}
  ```

- **constants.ts**
  ```typescript
  export const MAP_DEFAULTS = {
    center: [61.5, 8.0],
    zoom: 6,
    ...
  }
  ```

### Phase 2: Extract Map Components

#### 2.1 Break down MapContainer (`src/components/map/`)

- **MapView** - Core map rendering
  - Only handles map initialization
  - Manages base layers
  - Handles map events

- **MarkerLayer** - Marker rendering
  - Renders all markers
  - Handles clustering
  - Manages marker events

- **ConnectionLayer** - Connection lines
  - Renders connection lines
  - Handles line styles
  - Manages visibility

- **PopupManager** - Popup orchestration
  - Manages popup state
  - Handles popup events
  - Coordinates popup content

- **MapControls** - Map controls
  - Satellite toggle
  - Zoom controls
  - User location button

- **UserLocation** - User location tracking
  - Get user location
  - Show location marker
  - Update location

### Phase 3: Extract Business Logic

#### 3.1 Popup Content Components (`src/components/popups/`)

- **AirportPopup**
  - Airport-specific popup content
  - Edit functionality
  - Action buttons

- **LandingsplassPopup**
  - Landingsplass popup content
  - Related data display
  - Connection management

- **KalkPopup**
  - Kalk information display
  - Comment functionality

#### 3.2 State Management (`src/store/` or `src/contexts/`)

- **MapContext** - Map state and operations
- **DataContext** - Application data
- **UserContext** - User and permissions
- **UIContext** - UI state (mobile, panels, etc.)

### Phase 4: Improve Type Safety

#### 4.1 Enhanced Type Definitions (`src/types/`)

- **leaflet-extensions.d.ts**
  ```typescript
  import * as L from 'leaflet';
  
  declare module 'leaflet' {
    interface MarkerClusterGroupOptions {...}
    interface RoutingControl {...}
  }
  ```

- **api.types.ts**
  ```typescript
  export interface ApiResponse<T> {
    data: T;
    error?: string;
    status: number;
  }
  ```

- **ui.types.ts**
  ```typescript
  export interface PopupProps {
    isOpen: boolean;
    onClose: () => void;
    position: Coordinates;
  }
  ```

### Phase 5: Performance Optimization

#### 5.1 Code Splitting
- Lazy load heavy components
- Dynamic imports for Leaflet
- Split vendor bundles
- Route-based code splitting

#### 5.2 Memoization Strategy
- Memoize expensive computations
- Use React.memo for pure components
- Implement useMemo/useCallback properly
- Cache API responses

#### 5.3 Bundle Optimization
- Tree shaking for unused code
- Minimize bundle size
- Optimize images and assets
- Enable compression

## Implementation Priority

### High Priority (Do First)
1. Extract useDataFetching hook - Biggest impact on maintainability
2. Create DataService - Centralize all Supabase operations
3. Break down MapContainer - Critical for maintainability
4. Extract popup components - Quick win for code organization

### Medium Priority
5. Create remaining hooks (usePermissions, useMobileDetection)
6. Extract MapService for Leaflet operations
7. Implement proper TypeScript types
8. Create utility functions

### Low Priority (Do Later)
9. Implement state management solution
10. Add comprehensive error handling
11. Performance optimizations
12. Add unit tests

## Migration Strategy

### Step-by-Step Approach
1. Start with new features - implement using new patterns
2. Gradually refactor existing code during bug fixes
3. Extract one concern at a time
4. Maintain backward compatibility during transition
5. Add tests before refactoring critical parts

### Testing Strategy
- Add unit tests for new utilities and services
- Integration tests for hooks
- Component tests for UI components
- E2E tests for critical user flows

## Expected Benefits

### Immediate Benefits
- **Easier debugging** - Smaller, focused modules
- **Faster development** - Reusable components and hooks
- **Better collaboration** - Clear separation of concerns
- **Reduced bugs** - Type safety catches issues early

### Long-term Benefits
- **Scalability** - Easy to add new features
- **Maintainability** - Simple to update and modify
- **Performance** - Optimized bundle and rendering
- **Testing** - Isolated units are easier to test
- **Documentation** - Clear module boundaries

## Metrics for Success
- Reduce MapContainer from 3000+ lines to under 200
- Achieve 80%+ TypeScript type coverage
- Reduce bundle size by 30%
- Improve initial load time by 40%
- Zero `any` types in new code

## Notes for Future Development

### Naming Conventions
- Hooks: `use{Feature}` (e.g., useMapManager)
- Services: `{Domain}Service` (e.g., DataService)
- Utils: Descriptive function names (e.g., formatTonnage)
- Components: PascalCase, descriptive names

### File Organization
```
src/
├── components/
│   ├── map/
│   ├── popups/
│   ├── ui/
│   └── shared/
├── hooks/
├── services/
├── utils/
├── types/
├── contexts/
└── app/
```

### Code Style Guidelines
- Prefer composition over inheritance
- Keep functions small and focused
- Use TypeScript strict mode
- Avoid inline styles
- Extract magic numbers to constants
- Add JSDoc comments for complex functions

## Potential Libraries to Consider
- **@tanstack/react-query** - For data fetching and caching
- **zustand** or **jotai** - For state management
- **react-hook-form** - For form handling
- **zod** - For runtime type validation
- **react-window** - For virtualizing long lists

## Security Considerations
- Never expose Supabase keys in client code
- Implement proper authentication checks
- Validate all user inputs
- Sanitize data before rendering
- Use environment variables for sensitive config

## Performance Monitoring
- Add performance marks for critical operations
- Monitor bundle size with webpack-bundle-analyzer
- Use React DevTools Profiler
- Track Core Web Vitals
- Implement error tracking (e.g., Sentry)