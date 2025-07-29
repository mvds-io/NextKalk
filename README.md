# Kalk Planner 2025 - Next.js Version

A modern React/Next.js version of the Kalk Planner helicopter operations mapping application.

## Overview

This application is used for planning helicopter operations related to seeding/fertilizing lakes ("kalk" means lime/chalk in Norwegian). It provides an interactive map interface for managing:

- **Vann (Lakes/Water)**: Water bodies where operations take place
- **Landingsplasser (Landing Places)**: Helicopter landing spots
- **Kalk markers**: Information and comment markers
- **Associations**: Connections between different markers
- **Progress tracking**: Task completion and prioritization

## Features

- 🗺️ Interactive Leaflet map with custom markers
- 📊 Real-time progress tracking (remaining/completed tasks)
- 🎯 County-based filtering
- 🔄 Drag-and-drop prioritization
- 🔐 User authentication and role-based permissions
- 📱 Responsive design (mobile/tablet/desktop)
- 🛣️ GPS route planning
- 📥 GPX export functionality
- 📄 PDF export for completed tasks
- 📸 Image and document upload
- 🔗 Connection lines between related markers

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **UI Library**: Bootstrap 5
- **Mapping**: Leaflet with plugins
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Icons**: Font Awesome
- **Styling**: CSS (converted from original project)

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with global styles
│   ├── page.tsx            # Main application page
│   └── globals.css         # Global CSS styles
├── components/
│   ├── LoadingScreen.tsx   # Loading screen component
│   ├── Counter.tsx         # Progress counter and filters
│   ├── MapContainer.tsx    # Main map component
│   ├── ProgressPlan.tsx    # Right panel task list
│   └── AuthContainer.tsx   # Authentication UI
├── lib/
│   ├── config.ts          # Application configuration
│   └── supabase.ts        # Supabase client setup
└── types/
    ├── index.ts           # TypeScript type definitions
    └── leaflet.d.ts       # Leaflet plugin type declarations
```

## Database Tables

The application uses the following Supabase tables:

- `vass_vann`: Water bodies/lakes data
- `vass_lasteplass`: Landing places data  
- `vass_info`: Comment/info markers
- `vass_associations`: Connections between markers
- `users`: User accounts and permissions
- `user_action_logs`: Activity logging
- Various image/document tables

## Environment Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment variables:**
   Create a `.env.local` file:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## Configuration

The main configuration is in `src/lib/config.ts`:

- Supabase connection settings
- Database table names
- Storage bucket configuration
- Loading steps configuration

## Key Components

### MapContainer
- Handles Leaflet map initialization
- Manages markers for different types (airports, landing places, kalk)
- Implements filtering and popup interactions
- Uses dynamic imports to avoid SSR issues

### Counter
- Displays progress statistics
- County filtering dropdown
- Legend with marker types
- Connection toggle button

### ProgressPlan
- Sortable task list in right panel
- Drag-and-drop prioritization
- Task status management
- Quick action buttons

### AuthContainer
- User login/logout functionality
- Role-based permission display
- Modal-based login form

## Features from Original Project

This Next.js version maintains all the functionality from the original vanilla JavaScript version:

- ✅ Interactive map with multiple marker types
- ✅ User authentication and permissions
- ✅ Progress tracking and counters
- ✅ County filtering
- ✅ Responsive mobile design
- ✅ Loading screens with progress
- ✅ Bootstrap UI components
- ✅ Custom CSS styling
- 🔧 Route planning (basic implementation)
- 🔧 Drag-and-drop sorting (placeholder)
- 🔧 Image/document upload (placeholder)
- 🔧 Connection lines (placeholder)
- 🔧 GPX export (placeholder)

## Development Notes

### Leaflet Integration
- Uses dynamic imports to avoid SSR issues
- Custom type declarations for Leaflet plugins
- Proper cleanup of map instances

### Responsive Design
- Mobile-first approach with 50/50 split on mobile
- Tablet optimizations for better UX
- Desktop layout with 70/30 split

### State Management
- React hooks for local state
- Supabase for persistent data
- Real-time updates via Supabase subscriptions

## Migration from Original

This version converts the original vanilla JavaScript application to modern React/Next.js while maintaining:

- Original CSS styling (copied exactly)
- Database schema compatibility
- User interface layout and behavior
- Norwegian language interface
- Bootstrap component structure

## Performance Considerations

- Dynamic imports for heavy libraries (Leaflet)
- Efficient re-rendering with proper dependencies
- Optimized map marker updates
- Lazy loading of components

## Browser Support

- Modern browsers with ES6+ support
- Mobile Safari optimizations
- Touch-friendly interface
- Responsive design for all screen sizes

## Contributing

When adding new features:

1. Follow the existing component structure
2. Maintain TypeScript type safety
3. Use Bootstrap classes for consistency
4. Test on mobile devices
5. Ensure Supabase integration works properly

## License

This project is part of the GmlPlanner helicopter operations management system.
# NextKalk
