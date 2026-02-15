# Smart Bookmark Manager

A modern bookmark manager built with Next.js and Supabase, featuring Google OAuth authentication and real-time synchronization.

## Features

- **Google OAuth Authentication**: Secure login using Google accounts only
- **Private Bookmarks**: Each user's bookmarks are completely private
- **Real-time Sync**: Changes appear instantly across all open tabs
- **Add Bookmarks**: Save links with custom titles
- **Delete Bookmarks**: Remove bookmarks you no longer need
- **Beautiful UI**: Clean, modern interface built with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Authentication & Database**: Supabase
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works)
- Google OAuth configured in Supabase

### 2. Supabase Configuration

First, set up your Supabase database by following the instructions in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Install Dependencies

```bash
npm install
# or
yarn install
```

### 5. Run Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel

### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Click "Import Project"
4. Select your GitHub repository
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Click "Deploy"

### Option 2: Deploy via Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts and add your environment variables when asked.

### Important: Update Google OAuth Redirect URL

After deployment:

1. Copy your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Go to Supabase Dashboard → Authentication → URL Configuration
3. Add your Vercel URL to "Site URL"
4. Add `https://your-app.vercel.app/**` to "Redirect URLs"
5. Update the same URL in your Google Cloud Console OAuth settings

## How It Works

### Authentication Flow

1. User clicks "Sign in with Google"
2. Supabase redirects to Google OAuth consent screen
3. User selects Google account and grants permission
4. Google redirects back to the app with auth token
5. Supabase creates/updates user session
6. App displays authenticated user interface

### Adding Bookmarks

1. User enters title and URL in the form
2. Frontend calls `supabase.from('bookmarks').insert()`
3. Supabase validates Row Level Security (RLS) policies
4. Bookmark is inserted with user_id from authenticated session
5. Real-time subscription triggers, adding bookmark to UI instantly

### Real-time Sync

1. On login, app subscribes to Supabase real-time channel
2. Channel listens for INSERT and DELETE events on bookmarks table
3. When any change occurs, Supabase sends event to all subscribed clients
4. App updates local state immediately without page refresh
5. Works across multiple browser tabs seamlessly

### Deleting Bookmarks

1. User clicks delete button
2. Frontend calls `supabase.from('bookmarks').delete().eq('id', bookmarkId)`
3. RLS policy verifies user owns the bookmark
4. Bookmark is deleted from database
5. Real-time event triggers, removing bookmark from UI

## Problems Encountered & Solutions

### Problem 1: Row Level Security Configuration

**Issue**: Initially forgot to enable RLS, allowing users to see all bookmarks.

**Solution**: 
- Enabled RLS on bookmarks table
- Created specific policies for SELECT, INSERT, and DELETE operations
- Used `auth.uid()` to match user_id in policies

### Problem 2: Real-time Not Working

**Issue**: Changes weren't appearing in other tabs.

**Solution**:
- Added `ALTER PUBLICATION supabase_realtime ADD TABLE bookmarks;` to SQL
- Set up proper channel subscription with user_id filter
- Ensured subscription cleanup on component unmount

### Problem 3: OAuth Redirect Loop

**Issue**: After Google sign-in, app kept redirecting back to Google.

**Solution**:
- Set correct `redirectTo` option in `signInWithOAuth()`
- Matched redirect URL in Supabase settings with actual deployment URL
- Updated Google Cloud Console OAuth settings with same URL

### Problem 4: Environment Variables Not Loading

**Issue**: Supabase client couldn't initialize due to undefined env vars.

**Solution**:
- Used `NEXT_PUBLIC_` prefix for client-side environment variables
- Added variables to both `.env.local` and Vercel dashboard
- Restarted dev server after adding variables

## Project Structure

```
/app
├── app/
│   ├── page.js          # Main application component
│   ├── layout.js        # Root layout with metadata
│   └── globals.css      # Global styles
├── lib/
│   └── supabase.js      # Supabase client initialization
├── components/ui/       # shadcn/ui components
└── README.md           # This file
```

## Security

- All bookmark operations are protected by Row Level Security
- Users can only access their own bookmarks
- Authentication tokens are handled securely by Supabase
- No sensitive data is stored in frontend code

## License

MIT
