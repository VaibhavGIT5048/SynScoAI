import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const configured = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseClient: SupabaseClient | null = null;
if (configured) {
  supabaseClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function isSupabaseAuthConfigured(): boolean {
  return configured;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    return null;
  }

  return data.session?.access_token ?? null;
}

export async function getSupabaseUserEmail(): Promise<string | null> {
  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    return null;
  }

  return data.user?.email ?? null;
}

export async function signInWithSupabasePassword(email: string, password: string): Promise<string> {
  if (!supabaseClient) {
    throw new Error('Supabase auth is not configured in frontend env.');
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message || 'Sign in failed.');
  }

  const signedInEmail = data.user?.email;
  if (!signedInEmail) {
    throw new Error('Sign in did not return a valid user session.');
  }

  return signedInEmail;
}

export async function signOutFromSupabase(): Promise<void> {
  if (!supabaseClient) {
    return;
  }

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    throw new Error(error.message || 'Sign out failed.');
  }
}

export function subscribeSupabaseAuth(onEmailChange: (email: string | null) => void): () => void {
  if (!supabaseClient) {
    return () => undefined;
  }

  const {
    data: { subscription },
  } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    onEmailChange(session?.user?.email ?? null);
  });

  return () => subscription.unsubscribe();
}
