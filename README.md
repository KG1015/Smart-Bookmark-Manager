Smart Bookmark Manager

A real-time, cloud-synchronized bookmark management web application built with Next.js and Supabase, featuring secure Google OAuth authentication, private user-scoped storage, and instant cross-tab synchronization.

This project was designed to simulate modern SaaS-style productivity tooling with strong emphasis on:

real-time UX

security via Row Level Security (RLS)

production-ready deployment

low-latency UI updates

✨ Features

Google OAuth Authentication
Secure sign-in using Google accounts with Supabase Auth.

Private User Bookmarks
Each user can only access their own bookmarks using Row Level Security policies.

Real-time Synchronization
Bookmark changes appear instantly across multiple tabs/devices without refresh.

Add & Delete Bookmarks
Simple UI for saving and removing links with custom titles.

Responsive Modern UI
Built using Tailwind CSS + shadcn/ui for a clean SaaS-style interface.

Production Deployment
Hosted on Vercel with environment-based configuration and CI integration.

🛠 Tech Stack
Frontend

Next.js 14 (App Router)

React

Tailwind CSS

shadcn/ui

Backend / Cloud

Supabase (PostgreSQL + Auth + Realtime)

Row Level Security (RLS)

Google OAuth 2.0

Deployment

Vercel serverless hosting

GitHub version control & CI/CD


---

## 🧠 Engineering Challenges & Solutions

---


1️⃣ Row Level Security Misconfiguration

Problem
Initially, bookmarks from all users were visible because RLS was not enabled.

Solution

Enabled RLS on the bookmarks table

Added SELECT / INSERT / DELETE policies using auth.uid()

Ensured 100% user-scoped data isolation

2️⃣ Real-time Updates Not Reflecting in UI

Problem
Bookmarks were correctly saved/deleted in the database, but the UI required manual refresh to show changes.

Root Cause
A complex optimistic update + pendingActionRef logic was blocking real-time subscription events.

Solution

Removed unnecessary optimistic-update tracking

Updated UI immediately after successful DB operation

Used Supabase Realtime only for cross-tab synchronization

Result

Instant UI updates without refresh

Simpler and more reliable state management

3️⃣ OAuth Redirect Loop After Login

Problem
After Google sign-in, the app continuously redirected back to Google.

Solution

Correctly configured redirectTo in signInWithOAuth()

Matched redirect URLs across:

Supabase dashboard

Google Cloud Console

Vercel deployment URL

4️⃣ Environment Variables Not Loading in Production

Problem
Supabase client failed to initialize due to missing environment variables.

Solution

Used NEXT_PUBLIC_ prefix for client-side variables

Added variables in:

.env.local

Vercel dashboard

Restarted dev server after configuration

⚙️ How It Works
Authentication Flow

User clicks Sign in with Google

Redirect to Google OAuth consent screen

Google returns authentication token

Supabase creates user session

App loads user-specific bookmarks

Real-time Bookmark Sync

App subscribes to Supabase realtime channel on login

Listens for INSERT & DELETE events on bookmarks table

Database changes are pushed to all active clients

UI updates instantly without refresh

📦 Local Setup
Prerequisites

Node.js 18+

Supabase account

Google OAuth configured in Supabase

Environment Variables

Create .env.local:

NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

Install & Run
npm install
npm run dev


Open http://localhost:3000

🚀 Deployment (Vercel)

Push repo to GitHub

Import project in Vercel

Add environment variables

Deploy

Then configure OAuth redirect URLs in:

Supabase Auth settings

Google Cloud Console

🔐 Security Considerations

Row Level Security enforces strict user data isolation

OAuth handled securely by Supabase

No secrets exposed in frontend code

Environment variables protected via .env & Vercel config

📈 Project Impact

Achieved instant real-time UI updates without refresh

Ensured 100% private bookmark access per user

Reduced redundant data fetching through realtime sync

Built production-ready architecture with serverless deployment

📄 License

MIT
