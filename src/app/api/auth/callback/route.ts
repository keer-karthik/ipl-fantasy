import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  const redirectTo = new URL(next, request.url);
  const errorUrl = new URL('/login?error=auth', request.url);

  // Build a Supabase client that writes cookies directly onto the response
  function makeClient(response: NextResponse) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );
  }

  // Magic link flow: token_hash + type
  if (token_hash && type) {
    const response = NextResponse.redirect(redirectTo);
    const { error } = await makeClient(response).auth.verifyOtp({ token_hash, type });
    if (!error) return response;
  }

  // OAuth / PKCE flow: code
  if (code) {
    const response = NextResponse.redirect(redirectTo);
    const { error } = await makeClient(response).auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  return NextResponse.redirect(errorUrl);
}
