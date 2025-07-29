# Setup Guide

## Environment Variables

Create a `.env.local` file in the project root with your Supabase credentials:

```bash
# Copy this template and replace with your actual Supabase values
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### How to get your Supabase credentials:

1. Go to [supabase.com](https://supabase.com) and sign in
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. Copy the **Project URL** and **anon/public key**

## Database Tables

The app expects these tables in your Supabase database:

- `vass_vann` - Water bodies/lakes
- `vass_lasteplass` - Landing places  
- `vass_info` - Comment/info markers
- `vass_associations` - Marker associations
- `users` - User accounts and permissions
- `user_action_logs` - Activity logging

If you have the original database, all tables should already exist.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Troubleshooting

### "Could not load data" warnings
- Check that your Supabase credentials are correct in `.env.local`
- Verify that the database tables exist
- Check Supabase dashboard for any connection issues

### Map not loading
- Check browser console for JavaScript errors
- Ensure all Leaflet CSS files are loading properly
- Verify internet connection for map tiles

### No markers on map
- This is normal if the database tables are empty
- Add some test data to see markers appear
- Check browser console for coordinate validation warnings

## Test Without Database

The app will still work without a database connection:
- Shows empty map
- Displays "0" in counters
- Shows login button
- All UI components render properly

This allows you to test the interface while setting up the database. 