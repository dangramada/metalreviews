// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
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

  describe('user reference stability', () => {
    type Cb = (event: string, session: unknown) => void;
    let emit: Cb;
    let effectRuns: number;

    // Stands in for useCalibrationGate / useAlbumRatingsSummary: refetches when `user` changes.
    function EffectConsumer() {
      const { user, loading } = useAuth();
      useEffect(() => {
        effectRuns += 1;
      }, [user]);
      return <div>{loading ? 'loading' : (user?.id ?? 'no user')}</div>;
    }

    const session = (id: string, email: string) => ({ user: { id, email, token: Math.random() } });

    async function mount(initial: unknown) {
      effectRuns = 0;
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: initial },
      } as never);
      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: Cb) => {
        emit = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }) as never);
      await act(async () => {
        render(
          <AuthProvider>
            <EffectConsumer />
          </AuthProvider>
        );
      });
    }

    it('does not refire user-dependent effects on INITIAL_SESSION for the same user', async () => {
      await mount(session('u1', 'a@x.com'));
      const before = effectRuns;
      await act(async () => emit('INITIAL_SESSION', session('u1', 'a@x.com')));
      expect(effectRuns).toBe(before);
    });

    it('does not refire on TOKEN_REFRESHED for the same user', async () => {
      await mount(session('u1', 'a@x.com'));
      const before = effectRuns;
      await act(async () => emit('TOKEN_REFRESHED', session('u1', 'a@x.com')));
      expect(effectRuns).toBe(before);
    });

    it('clears the user on sign out', async () => {
      await mount(session('u1', 'a@x.com'));
      await act(async () => emit('SIGNED_OUT', null));
      expect(screen.getByText('no user')).toBeInTheDocument();
    });

    it('switches to the new user and refires effects on a different account', async () => {
      await mount(session('u1', 'a@x.com'));
      const before = effectRuns;
      await act(async () => emit('SIGNED_IN', session('u2', 'b@x.com')));
      expect(screen.getByText('u2')).toBeInTheDocument();
      expect(screen.queryByText('u1')).not.toBeInTheDocument();
      expect(effectRuns).toBe(before + 1);
    });
  });
});
