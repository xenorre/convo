import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { AppToaster } from '../AppToaster';

vi.mock('react-hot-toast', async importOriginal =>
  importOriginal<typeof import('react-hot-toast')>()
);

describe('notification lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    act(() => toast.remove());
  });

  afterEach(() => {
    cleanup();
    act(() => toast.remove());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('announces the message and lets the user dismiss it', async () => {
    render(<AppToaster />);
    await act(async () => { toast.error('Please fix the errors below'); });

    expect(screen.getByRole('status')).toHaveTextContent('Please fix the errors below');
    const dismissButton = screen.getByRole('button', { name: 'Dismiss notification' });
    expect(screen.getByRole('status')).not.toContainElement(dismissButton);

    fireEvent.click(dismissButton);
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(screen.queryByText('Please fix the errors below')).not.toBeInTheDocument();
  });

  it('expires errors while keeping loading visible until the operation finishes', async () => {
    render(<AppToaster />);
    let loadingId = '';
    await act(async () => {
      toast.error('Could not save your changes');
      loadingId = toast.loading('Sending your message');
    });

    await act(async () => { vi.advanceTimersByTime(6000); });
    await act(async () => { vi.advanceTimersByTime(200); });

    expect(screen.queryByText('Could not save your changes')).not.toBeInTheDocument();
    expect(screen.getByText('Sending your message')).toBeInTheDocument();

    await act(async () => { toast.success('Message sent', { id: loadingId }); });
    expect(screen.queryByText('Sending your message')).not.toBeInTheDocument();
    expect(screen.getByText('Message sent')).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('Message sent')).not.toBeInTheDocument();
  });
});
