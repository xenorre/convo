import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import toast from 'react-hot-toast';
import { useChatStore } from '@/store/useChatStore';
import { DEFAULT_DEVICE_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { notifyFriendRequest } from '../friendNotifications';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(() => 'id'), { dismiss: vi.fn() }) }));

const request = { friendRequestId: 'r1', user: { _id: 'anna', fullName: 'Anna', profilePic: '' }, createdAt: 'now' };

describe('friend request pop-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState(DEFAULT_DEVICE_SETTINGS);
    useChatStore.setState({
      ...useChatStore.getInitialState(),
      friendsView: 'add',
      selectedUser: { _id: 'bob', fullName: 'Bob', profilePic: '' },
    });
  });

  it('opens the Friends tab from the pop-up', async () => {
    const user = userEvent.setup();
    notifyFriendRequest(request);
    const renderToast = vi.mocked(toast).mock.calls[0][0] as (t: unknown) => React.ReactElement;
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={renderToast({ id: 't1', visible: true })} />
          <Route path="/" element={<p>Chats page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Anna sent you a friend request/ }));

    expect(await screen.findByText('Chats page')).toBeInTheDocument();
    // Leaves the add-friend search so the requests are in view.
    await vi.waitFor(() => expect(useChatStore.getState()).toMatchObject({
      activeTab: 'friends', friendsView: 'list', selectedUser: null,
    }));
    expect(toast.dismiss).toHaveBeenCalledWith('t1');
  });

  it('stays quiet when friend request pop-ups are off', () => {
    useSettingsStore.setState({ friendRequestToasts: false });

    expect(notifyFriendRequest(request)).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });
});
