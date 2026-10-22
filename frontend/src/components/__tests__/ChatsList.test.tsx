import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import ChatsList from '../ChatsList';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn() },
}));

const lastMessage = (senderId: string, text: string, hasAttachment = false) => ({
  _id: `${senderId}-${text}`,
  senderId,
  text,
  hasAttachment,
  createdAt: new Date().toISOString(),
});

describe('ChatsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState(useChatStore.getInitialState(), true);
    useAuthStore.setState({
      ...useAuthStore.getInitialState(),
      authUser: { _id: 'my-id', fullName: 'Me', email: 'me@example.com', profilePic: '' },
      onlineUsers: ['anna-id'],
    }, true);
    vi.mocked(apiService.get).mockResolvedValue({
      chats: [
        { _id: 'anna-id', fullName: 'Anna', profilePic: '', lastMessage: lastMessage('anna-id', 'See you at 5') },
        { _id: 'bartek-id', fullName: 'Bartek', profilePic: '', lastMessage: lastMessage('my-id', 'Thanks!') },
        { _id: 'celina-id', fullName: 'Celina', profilePic: '', lastMessage: lastMessage('celina-id', '', true) },
        { _id: 'dawid-id', fullName: 'Dawid', profilePic: '' },
      ],
      unreadCounts: { 'anna-id': 2 },
    });
  });

  it('shows the last message, its time and the unread count in server order', async () => {
    render(<ChatsList />);

    const rows = await screen.findAllByRole('button');
    expect(rows.map(row => within(row).getByRole('heading').textContent)).toEqual([
      'Anna (Online)', 'Bartek (Offline)', 'Celina (Offline)', 'Dawid',
    ]);

    expect(within(rows[0]).getByText('See you at 5')).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText('2 unread messages')).toBeInTheDocument();
    expect(rows[0].querySelector('time')).toHaveTextContent(/\d{1,2}:\d{2}/);

    expect(within(rows[1]).getByText('You:')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Thanks!')).toBeInTheDocument();

    expect(within(rows[2]).getByLabelText('Attachment')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Attachment')).toBeInTheDocument();

    // Without a summary the row falls back to the presence label.
    expect(within(rows[3]).getByText('Offline')).toBeInTheDocument();
    expect(rows[3].querySelector('time')).toBeNull();
  });

  it('filters chats by the search query and offers to clear an empty result', async () => {
    const { rerender } = render(<ChatsList />);
    await screen.findAllByRole('button');

    useChatStore.getState().setChatSearchQuery('bartek');
    rerender(<ChatsList />);
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['Bartek (Offline)']);
    expect(screen.getByRole('status')).toHaveTextContent('1 chat found');

    useChatStore.getState().setChatSearchQuery('nobody');
    rerender(<ChatsList />);
    expect(screen.queryAllByRole('heading')).toEqual([]);
    expect(screen.getByText(/No chats match/)).toHaveTextContent('No chats match “nobody”');

    screen.getByRole('button', { name: 'Clear search' }).click();
    rerender(<ChatsList />);
    expect(useChatStore.getState().chatSearchQuery).toBe('');
    expect(screen.getAllByRole('heading')).toHaveLength(4);
  });

  it('marks a muted chat and greys out its unread count', async () => {
    vi.mocked(apiService.get).mockResolvedValue({
      chats: [{ _id: 'anna-id', fullName: 'Anna', profilePic: '', lastMessage: lastMessage('anna-id', 'See you at 5') }],
      unreadCounts: { 'anna-id': 2 },
      mutes: { 'anna-id': null },
    });
    render(<ChatsList />);

    const row = await screen.findByRole('button', { name: /Anna/ });
    expect(within(row).getByRole('img', { name: 'Muted' })).toBeInTheDocument();
    expect(within(row).getByLabelText('2 unread messages')).toHaveClass('text-slate-300');
  });
});
