// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from '../RequireAuth';

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../AuthContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/favorites']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/favorites" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  it('renders nothing while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true });
    const { container } = render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
      { wrapper }
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('redirects to /login when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
      { wrapper }
    );
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when user is logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'dan@test.com' } as any,
      loading: false,
    });
    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
      { wrapper }
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
