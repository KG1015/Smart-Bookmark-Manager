'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bookmark, Trash2, LogOut, Chrome, ExternalLink, Sparkles, Zap, Star } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

export default function Home() {
  const [user, setUser] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const channelRef = useRef(null)
  const pendingActionRef = useRef(null)

  // Check for existing session and set up auth listener
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch bookmarks when user logs in
  useEffect(() => {
    if (user) {
      fetchBookmarks()
      subscribeToBookmarks()
    } else {
      setBookmarks([])
      // Clean up subscription when user logs out
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user])

  // Fetch all bookmarks for current user
  const fetchBookmarks = async () => {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBookmarks(data || [])
    } catch (error) {
      console.error('Error fetching bookmarks:', error)
      toast.error('Failed to load bookmarks')
    }
  }

  // Subscribe to real-time changes with improved handling
  const subscribeToBookmarks = () => {
    // Remove existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`bookmarks-${user.id}`, {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmarks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Real-time event received:', payload)
          
          // Skip if this is our own action
          if (pendingActionRef.current === payload.eventType) {
            console.log('Skipping self-triggered event')
            pendingActionRef.current = null
            return
          }
          
          if (payload.eventType === 'INSERT') {
            setBookmarks((prev) => {
              // Check if bookmark already exists (avoid duplicates)
              const exists = prev.some(b => b.id === payload.new.id)
              if (exists) return prev
              return [payload.new, ...prev]
            })
            toast.success('Bookmark synced from another device!', { duration: 2000 })
          } else if (payload.eventType === 'DELETE') {
            setBookmarks((prev) => prev.filter((b) => b.id !== payload.old.id))
            toast.success('Bookmark removed from another device!', { duration: 2000 })
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to real-time updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Subscription error, retrying...')
          // Retry subscription after 2 seconds
          setTimeout(() => {
            if (user) subscribeToBookmarks()
          }, 2000)
        }
      })

    channelRef.current = channel
  }

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('Error signing in:', error)
      toast.error('Failed to sign in with Google')
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('Signed out successfully')
    } catch (error) {
      console.error('Error signing out:', error)
      toast.error('Failed to sign out')
    }
  }

  // Add new bookmark
  const addBookmark = async (e) => {
    e.preventDefault()
    if (!title.trim() || !url.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    setSubmitting(true)
    
    // Create temporary bookmark for instant UI update
    const tempId = `temp-${Date.now()}`
    const tempBookmark = {
      id: tempId,
      title: title.trim(),
      url: url.trim(),
      user_id: user.id,
      created_at: new Date().toISOString()
    }

    // Optimistically update UI immediately
    setBookmarks(prev => [tempBookmark, ...prev])
    
    // Clear form immediately for better UX
    const savedTitle = title
    const savedUrl = url
    setTitle('')
    setUrl('')
    
    try {
      // Mark that we're performing an INSERT
      pendingActionRef.current = 'INSERT'
      
      const { data, error } = await supabase
        .from('bookmarks')
        .insert([{ title: savedTitle.trim(), url: savedUrl.trim(), user_id: user.id }])
        .select()

      if (error) throw error

      // Replace temporary bookmark with real one from database
      if (data && data[0]) {
        setBookmarks(prev => prev.map(b => 
          b.id === tempId ? data[0] : b
        ))
      }
      
      toast.success('Bookmark added successfully')
      
      // Clear pending action after a short delay
      setTimeout(() => {
        pendingActionRef.current = null
      }, 1000)
    } catch (error) {
      console.error('Error adding bookmark:', error)
      toast.error('Failed to add bookmark')
      // Rollback: remove the temporary bookmark
      setBookmarks(prev => prev.filter(b => b.id !== tempId))
      // Restore form values
      setTitle(savedTitle)
      setUrl(savedUrl)
      pendingActionRef.current = null
    } finally {
      setSubmitting(false)
    }
  }

  // Delete bookmark
  const deleteBookmark = async (id) => {
    // Store the bookmark in case we need to rollback
    const bookmarkToDelete = bookmarks.find(b => b.id === id)
    if (!bookmarkToDelete) return
    
    // Optimistically update UI immediately
    setBookmarks(prev => prev.filter(b => b.id !== id))
    toast.success('Bookmark deleted')
    
    try {
      // Mark that we're performing a DELETE
      pendingActionRef.current = 'DELETE'
      
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // Clear pending action after a short delay
      setTimeout(() => {
        pendingActionRef.current = null
      }, 1000)
    } catch (error) {
      console.error('Error deleting bookmark:', error)
      toast.error('Failed to delete bookmark')
      // Rollback: restore the deleted bookmark
      setBookmarks(prev => [bookmarkToDelete, ...prev].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      ))
      pendingActionRef.current = null
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-fuchsia-950 relative overflow-hidden">
        {/* Animated background with nebula bursts */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-fuchsia-600 rounded-full blur-3xl animate-nebula-burst"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500 rounded-full blur-3xl animate-nebula-burst animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-violet-600 rounded-full blur-3xl animate-nebula-burst animation-delay-4000"></div>
        </div>

        {/* Twinkling stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(30)].map((_, i) => (
            <div
              key={`load-star-${i}`}
              className="absolute w-1 h-1 bg-white rounded-full animate-twinkle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
        
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-transparent border-t-fuchsia-400 border-r-cyan-400 mx-auto"></div>
            <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-white animate-pulse" />
          </div>
          <p className="mt-6 text-white text-xl font-bold tracking-wide">Initializing Space Portal...</p>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-fuchsia-950 p-4 relative overflow-hidden">
        <Toaster position="top-center" />
        
        {/* Animated background elements with nebula bursts */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-[450px] h-[450px] bg-fuchsia-600 rounded-full blur-3xl animate-nebula-burst"></div>
          <div className="absolute top-40 right-20 w-[550px] h-[550px] bg-cyan-500 rounded-full blur-3xl animate-nebula-burst animation-delay-2000"></div>
          <div className="absolute bottom-20 left-1/2 w-[500px] h-[500px] bg-violet-600 rounded-full blur-3xl animate-nebula-burst animation-delay-4000"></div>
        </div>

        {/* Cosmic grid */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Twinkling stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(60)].map((_, i) => (
            <div
              key={`twinkle-${i}`}
              className="absolute bg-white rounded-full animate-twinkle"
              style={{
                width: `${1 + Math.random() * 2}px`,
                height: `${1 + Math.random() * 2}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>

        {/* Star formation effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div
              key={`form-${i}`}
              className="absolute w-3 h-3 bg-fuchsia-400 rounded-full animate-star-form"
              style={{
                left: `${20 + Math.random() * 60}%`,
                top: `${20 + Math.random() * 60}%`,
                animationDelay: `${Math.random() * 4}s`,
                filter: 'blur(1px)'
              }}
            />
          ))}
        </div>

        {/* Shooting stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(3)].map((_, i) => (
            <div
              key={`shoot-${i}`}
              className="absolute w-20 h-0.5 bg-gradient-to-r from-white via-fuchsia-400 to-transparent rounded-full animate-shooting-star"
              style={{
                left: `${85 + Math.random() * 15}%`,
                top: `${Math.random() * 40}%`,
                animationDelay: `${i * 5}s`
              }}
            />
          ))}
        </div>

        <Card className="w-full max-w-md border-2 border-fuchsia-500/30 backdrop-blur-2xl bg-slate-900/40 relative z-10 transform hover:scale-105 transition-all duration-300 shadow-2xl shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:border-fuchsia-400/50">
          <CardHeader className="text-center space-y-6">
            <div className="mx-auto mb-2 w-24 h-24 bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg transform hover:rotate-12 transition-transform duration-300 relative group animate-cosmic-pulse">
              <Star className="w-12 h-12 text-white" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-500 blur-2xl opacity-60 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <div>
              <CardTitle className="text-5xl font-black bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent tracking-tight">
                BOOKMARK
              </CardTitle>
              <div className="text-3xl font-black bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent tracking-tight">
                NEXUS
              </div>
            </div>
            <CardDescription className="text-base text-gray-300 font-medium">
              Enter the quantum realm of organized links
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <Button
              onClick={signInWithGoogle}
              className="w-full py-7 text-lg font-bold bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-600 hover:from-fuchsia-500 hover:via-violet-500 hover:to-cyan-500 border-2 border-fuchsia-400/30 shadow-lg shadow-fuchsia-500/50 hover:shadow-fuchsia-500/70 transform hover:scale-105 transition-all duration-300 text-white"
              size="lg"
            >
              <Chrome className="mr-3 h-6 w-6" />
              CONNECT WITH GOOGLE
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Logged in - Main app
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-fuchsia-950 relative overflow-hidden">
      <Toaster position="top-center" />
      
      {/* Animated background with dramatic nebula effects */}
      <div className="absolute inset-0 opacity-30">
        {/* Main nebula clouds with burst effect */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-fuchsia-600 rounded-full blur-3xl animate-nebula-burst"></div>
        <div className="absolute top-1/3 right-1/4 w-[700px] h-[700px] bg-cyan-500 rounded-full blur-3xl animate-nebula-burst animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-[650px] h-[650px] bg-violet-600 rounded-full blur-3xl animate-nebula-burst animation-delay-4000"></div>
        
        {/* Additional nebula layers for depth */}
        <div className="absolute top-1/2 left-10 w-96 h-96 bg-fuchsia-700 rounded-full blur-3xl animate-blob"></div>
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-cyan-600 rounded-full blur-3xl animate-blob animation-delay-3000"></div>
      </div>

      {/* Cosmic grid overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(236, 72, 153, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(236, 72, 153, 0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
      </div>

      {/* Energy pulses */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        {[...Array(6)].map((_, i) => (
          <div
            key={`pulse-${i}`}
            className="absolute h-px bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent"
            style={{
              top: `${15 + i * 15}%`,
              left: '-100%',
              width: '200%',
              transform: 'rotate(-12deg)',
              animation: `shootingStar ${4 + i * 0.5}s linear infinite`,
              animationDelay: `${i * 1.5}s`,
            }}
          />
        ))}
      </div>

      {/* Twinkling stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(70)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute bg-white rounded-full animate-twinkle"
            style={{
              width: `${1 + Math.random() * 2}px`,
              height: `${1 + Math.random() * 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Star formation clusters */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(10)].map((_, i) => (
          <div
            key={`cluster-${i}`}
            className="absolute w-3 h-3 bg-fuchsia-400 rounded-full animate-star-form"
            style={{
              left: `${15 + Math.random() * 70}%`,
              top: `${15 + Math.random() * 70}%`,
              animationDelay: `${Math.random() * 4}s`,
              filter: 'blur(1.5px)'
            }}
          />
        ))}
      </div>

      {/* Shooting stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(4)].map((_, i) => (
          <div
            key={`shooting-${i}`}
            className="absolute w-24 h-0.5 bg-gradient-to-r from-white via-fuchsia-400 to-transparent rounded-full animate-shooting-star"
            style={{
              left: `${80 + Math.random() * 20}%`,
              top: `${Math.random() * 30}%`,
              animationDelay: `${i * 3.5}s`,
              animationDuration: '2.5s',
              transform: 'rotate(-45deg)'
            }}
          />
        ))}
      </div>
      
      {/* Header */}
      <header className="backdrop-blur-2xl bg-slate-900/40 border-b-2 border-fuchsia-500/20 relative z-10">
        <div className="container mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-fuchsia-500/50 transform hover:rotate-12 transition-transform animate-cosmic-pulse">
              <Star className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-fuchsia-300 to-cyan-300 bg-clip-text text-transparent tracking-tight">BOOKMARK NEXUS</h1>
              <p className="text-sm text-gray-400 font-medium">{user.email}</p>
            </div>
          </div>
          <Button 
            onClick={signOut} 
            className="bg-slate-800/50 hover:bg-slate-700/50 border-2 border-fuchsia-500/30 hover:border-fuchsia-400/50 text-white backdrop-blur-sm font-bold transform hover:scale-105 transition-all shadow-lg shadow-fuchsia-500/20"
            size="sm"
          >
            <LogOut className="mr-2 h-4 w-4" />
            DISCONNECT
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-10 max-w-5xl relative z-10">
        {/* Add Bookmark Form */}
        <Card className="mb-10 backdrop-blur-2xl bg-slate-900/40 border-2 border-fuchsia-500/30 shadow-2xl shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 hover:border-fuchsia-400/50 transform hover:scale-[1.01] transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-3 text-2xl font-black tracking-tight">
              <Zap className="w-6 h-6 text-fuchsia-400 animate-pulse" />
              DEPLOY NEW BOOKMARK
            </CardTitle>
            <CardDescription className="text-gray-400 font-medium">Quantum-link your favorite destinations</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={addBookmark} className="space-y-5">
              <div>
                <Input
                  type="text"
                  placeholder="ENTER TITLE"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-800/50 border-2 border-fuchsia-500/30 text-white placeholder:text-gray-500 placeholder:font-bold backdrop-blur-sm focus:bg-slate-800/70 focus:border-fuchsia-400 focus:shadow-lg focus:shadow-fuchsia-500/30 h-12 font-medium"
                  required
                />
              </div>
              <div>
                <Input
                  type="url"
                  placeholder="https://quantum-link.nexus"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-slate-800/50 border-2 border-fuchsia-500/30 text-white placeholder:text-gray-500 placeholder:font-bold backdrop-blur-sm focus:bg-slate-800/70 focus:border-fuchsia-400 focus:shadow-lg focus:shadow-fuchsia-500/30 h-12 font-medium"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full py-6 text-lg font-black tracking-wide bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-600 hover:from-fuchsia-500 hover:via-violet-500 hover:to-cyan-500 border-2 border-fuchsia-400/30 shadow-lg shadow-fuchsia-500/50 hover:shadow-fuchsia-500/70 transform hover:scale-105 transition-all duration-300 text-white"
              >
                {submitting ? '⚡ DEPLOYING...' : '⚡ DEPLOY BOOKMARK'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Bookmarks List */}
        <div className="space-y-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-4xl font-black bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent tracking-tight">QUANTUM VAULT</h2>
            <span className="text-sm font-bold text-gray-300 bg-fuchsia-500/20 border border-fuchsia-500/30 px-4 py-2 rounded-full backdrop-blur-sm">{bookmarks.length} LINKS</span>
          </div>

          {bookmarks.length === 0 ? (
            <Card className="backdrop-blur-2xl bg-slate-900/40 border-2 border-fuchsia-500/20 shadow-2xl">
              <CardContent className="py-16 text-center">
                <Star className="w-20 h-20 text-fuchsia-400/50 mx-auto mb-6 animate-pulse" />
                <p className="text-gray-300 text-xl font-bold">VAULT EMPTY - DEPLOY YOUR FIRST LINK</p>
                <p className="text-gray-500 text-sm mt-2">Start building your quantum collection</p>
              </CardContent>
            </Card>
          ) : (
            bookmarks.map((bookmark, index) => (
              <Card 
                key={bookmark.id} 
                className="backdrop-blur-2xl bg-slate-900/40 border-2 border-fuchsia-500/20 shadow-xl hover:shadow-2xl hover:shadow-fuchsia-500/30 hover:border-fuchsia-400/40 transition-all duration-300 transform hover:scale-[1.02] hover:-translate-y-1 group"
                style={{
                  animationDelay: `${index * 0.1}s`
                }}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500 to-cyan-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-fuchsia-500/30 group-hover:shadow-fuchsia-500/50 transition-shadow">
                          <Bookmark className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-black text-xl text-white mb-2 group-hover:text-fuchsia-300 transition-colors tracking-tight">
                            {bookmark.title}
                          </h3>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-2 break-all group-hover:underline"
                          >
                            <ExternalLink className="w-4 h-4 flex-shrink-0" />
                            {bookmark.url}
                          </a>
                          <p className="text-xs text-gray-500 mt-3 font-medium">
                            DEPLOYED: {new Date(bookmark.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => deleteBookmark(bookmark.id)}
                      className="bg-red-500/20 hover:bg-red-500/40 border-2 border-red-500/40 hover:border-red-400/60 text-red-300 hover:text-red-200 backdrop-blur-sm transform hover:scale-110 transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40 font-bold"
                      size="sm"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  )
}