// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock the entire supabaseClient module to avoid env var validation at import time.
// The mock is hoisted by Vitest so it runs before the actual module is imported.
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

// Import after vi.mock so we get the mocked version
import { supabase } from '../supabaseClient';

function TestConsumer() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? user.email : 'no user'}</div>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no session, with a subscription object for cleanup
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as any);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any);
  });

  it('starts in loading state then resolves to no user when session is null', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });
    expect(screen.getByText('no user')).toBeInTheDocument();
  });

  it('resolves to user email when session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { email: 'dan@example.com' } } },
    } as any);

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });
    expect(screen.getByText('dan@example.com')).toBeInTheDocument();
  });
});
