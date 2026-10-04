import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when Supabase credentials are configured — online play is only offered when this is set. */
export const isOnlineAvailable = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!client) {
    if (!isOnlineAvailable) {
      throw new Error('Online play is unavailable: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).')
    }
    client = createClient(supabaseUrl!, supabaseAnonKey!)
  }
  return client
}

/**
 * Lazily-created Supabase client. Nothing connects until online play first touches it,
 * so local and bot games work without any Supabase configuration.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient()
    const value = Reflect.get(c, prop, c)
    return typeof value === 'function' ? value.bind(c) : value
  },
})
