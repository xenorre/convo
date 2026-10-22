import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import ChatContainer from '@/components/ChatContainer';
import type { Message } from '@/types/message';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const sam = { _id: 'sam', fullName: 'Sam Lee', profilePic: '' };
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
const message = (fields: Partial<Message>): Message => ({
  _id: 'm', senderId: 'me', receiverId: 'sam', text: 'hi', createdAt: minutesAgo(1), updatedAt: minutesAgo(1), ...fields,
});

const fromSam = message({ _id: 'm1', senderId: 'sam', receiverId: 'me', text: 'Hey there', createdAt: minutesAgo(3) });
const mine = message({ _id: 'm2', text: 'Helo', createdAt: minutesAgo(2) });
const oldMine = message({ _id: 'm0', text: 'Long ago', createdAt: minutesAgo(60) });

describe('message actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(apiService.get).mockImplementation(async (url) =>
      url === '/users/sam/messaging' ? { canMessage: true } : { messages: [oldMine, fromSam, mine] });
    vi.mocked(apiService.post).mockResolvedValue({});
    useAuthStore.setState({ authUser: { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' }, socket: null, onlineUsers: [] });
    useChatStore.setState({
      ...useChatStore.getInitialState(),
      selectedUser: sam,
      chats: [{ ...sam, lastMessage: { _id: 'm2', senderId: 'me', text: 'Helo', hasAttachment: false, createdAt: mine.createdAt } }],
    });
    useFriendsStore.setState({ ...useFriendsStore.getInitialState(), hasLoaded: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderConversation = async () => {
    render(<ChatContainer />);
    await act(async () => {});
  };

  // The actions button of the bubble that shows `text`.
  const actionsFor = (text: string) => {
    const bubble = screen.getByText(text).closest('.chat-bubble') as HTMLElement;
    return within(bubble).getByRole('button', { name: 'Message actions' });
  };

  it('edits a recent message in place and marks it as edited, without jumping to the bottom', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.patch).mockResolvedValue({ message: { ...mine, text: 'Hello', editedAt: new Date().toISOString() } });
    await renderConversation();
    const scrolls = vi.mocked(Element.prototype.scrollTo).mock.calls.length;

    await user.click(actionsFor('Helo'));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const field = screen.getByRole('textbox', { name: 'Edit message' });
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, 'Hello{Enter}');

    expect(apiService.patch).toHaveBeenCalledWith('/messages/item/m2', { text: 'Hello' });
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Edited ·')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull();
    // The newest message is still the same one, so the chat list preview follows the edit.
    expect(useChatStore.getState().chats[0].lastMessage?.text).toBe('Hello');
    expect(vi.mocked(Element.prototype.scrollTo).mock.calls.length).toBe(scrolls);
  });

  it('Escape leaves the editor without saving or closing the conversation', async () => {
    const user = userEvent.setup();
    await renderConversation();

    await user.click(actionsFor('Helo'));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit message' }), ' changed{Escape}');

    expect(apiService.patch).not.toHaveBeenCalled();
    expect(screen.getByText('Helo')).toBeInTheDocument();
    expect(useChatStore.getState().selectedUser).toEqual(sam);
  });

  it('keeps the editor open when saving fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.patch).mockRejectedValue({
      response: { status: 409, data: { error: 'Messages can only be edited for 15 minutes after sending' } },
    });
    await renderConversation();

    await user.click(actionsFor('Helo'));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit message' }), '!{Enter}');

    expect(screen.getByRole('textbox', { name: 'Edit message' })).toHaveValue('Helo!');
  });

  it('only offers editing on my own messages from the last 15 minutes', async () => {
    const user = userEvent.setup();
    await renderConversation();

    await user.click(actionsFor('Hey there'));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    await user.click(actionsFor('Long ago'));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('deletes my message for everyone, leaving a placeholder', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.delete).mockResolvedValue({ message: { ...mine, text: undefined, deletedAt: new Date().toISOString() } });
    await renderConversation();

    await user.click(actionsFor('Helo'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete message?' });
    expect(within(dialog).getByRole('button', { name: 'Delete for me' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete for everyone' }));

    expect(apiService.delete).toHaveBeenCalledWith('/messages/item/m2?for=everyone');
    expect(screen.getByText('You deleted a message')).toBeInTheDocument();
    expect(screen.queryByText('Helo')).toBeNull();
    expect(useChatStore.getState().chats[0].lastMessage?.deleted).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it("only deletes someone else's message for me", async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.delete).mockResolvedValue({ messageId: 'm1', peerId: 'sam' });
    await renderConversation();

    await user.click(actionsFor('Hey there'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete message?' });
    expect(dialog).toHaveTextContent('Sam Lee will still see it');
    expect(within(dialog).queryByRole('button', { name: 'Delete for everyone' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Delete for me' }));

    expect(apiService.delete).toHaveBeenCalledWith('/messages/item/m1?for=me');
    expect(screen.queryByText('Hey there')).toBeNull();
  });

  it('moves the chat preview back to the previous message when I delete the newest one for me', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.delete).mockResolvedValue({ messageId: 'm2', peerId: 'sam' });
    await renderConversation();

    await user.click(actionsFor('Helo'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete for me' }));

    expect(useChatStore.getState().chats[0].lastMessage).toMatchObject({ _id: 'm1', text: 'Hey there' });
  });

  it('cancelling deletes nothing', async () => {
    const user = userEvent.setup();
    await renderConversation();

    await user.click(actionsFor('Helo'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(apiService.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Helo')).toBeInTheDocument();
    expect(actionsFor('Helo')).toHaveFocus();
  });

  it("doesn't offer actions on a message that is still being sent", async () => {
    vi.mocked(apiService.get).mockImplementation(async (url) =>
      url === '/users/sam/messaging' ? { canMessage: true } : { messages: [] });
    await renderConversation();
    await act(async () => useChatStore.setState({ messages: [message({ _id: 'temp-1', text: 'Sending' })] }));

    const bubble = screen.getByText('Sending').closest('.chat-bubble') as HTMLElement;
    expect(within(bubble).queryByRole('button', { name: 'Message actions' })).toBeNull();
  });
});
