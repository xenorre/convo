import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import ProfileSettings from '../ProfileSettings';

vi.mock('@/services/apiService', () => ({
  apiService: { put: vi.fn(), delete: vi.fn(), uploadFile: vi.fn() },
}));

const defaultPic = 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';
const account = { _id: 'me', fullName: 'Ada Lovelace', email: 'ada@example.com', profilePic: defaultPic };

const renderProfile = () => render(<MemoryRouter><ProfileSettings /></MemoryRouter>);
const image = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

describe('Profile settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ authUser: account });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  });

  it('saves a trimmed name and updates the signed-in user', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockResolvedValueOnce({ message: 'ok', user: { ...account, fullName: 'Ada King' } });
    renderProfile();
    const input = screen.getByLabelText('Full name');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, '  Ada King  ');
    await user.click(save);

    expect(apiService.put).toHaveBeenCalledExactlyOnceWith('/users/update-profile', { fullName: 'Ada King' });
    await waitFor(() => expect(useAuthStore.getState().authUser?.fullName).toBe('Ada King'));
    expect(input).toHaveValue('Ada King');
    expect(save).toBeDisabled();
  });

  it('explains a name that is too short without calling the server', async () => {
    const user = userEvent.setup();
    renderProfile();
    const input = screen.getByLabelText('Full name');

    await user.clear(input);
    await user.type(input, ' A ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 2 characters');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(apiService.put).not.toHaveBeenCalled();
  });

  it('restores the saved name on cancel', async () => {
    const user = userEvent.setup();
    renderProfile();
    const input = screen.getByLabelText('Full name');

    await user.type(input, 'x');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(input).toHaveValue('Ada Lovelace');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('rejects files the server would refuse before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderProfile();
    const fileInput = container.querySelector('input[type=file]') as HTMLInputElement;

    await user.upload(fileInput, image('doc.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG or WebP');

    await user.upload(fileInput, image('big.png', 'image/png', 5 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert')).toHaveTextContent('5 MB or smaller');
    expect(apiService.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads a photo with PUT and shows the new avatar', async () => {
    const user = userEvent.setup();
    const uploaded = { ...account, profilePic: 'https://cdn.test/me.png' };
    vi.mocked(apiService.uploadFile).mockResolvedValueOnce({ message: 'ok', user: uploaded });
    const { container } = renderProfile();
    const file = image('me.png', 'image/png');

    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    await user.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);

    expect(apiService.uploadFile).toHaveBeenCalledExactlyOnceWith(
      '/users/update-profile-image', file, undefined, 'profileImage', undefined, 'put',
    );
    await waitFor(() => expect(screen.getByAltText('Your profile photo')).toHaveAttribute('src', uploaded.profilePic));
    expect(useAuthStore.getState().authUser?.profilePic).toBe(uploaded.profilePic);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('removes an uploaded photo', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ authUser: { ...account, profilePic: 'https://cdn.test/me.png' } });
    vi.mocked(apiService.delete).mockResolvedValueOnce({ message: 'ok', user: account });
    renderProfile();

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(apiService.delete).toHaveBeenCalledExactlyOnceWith('/users/profile-image');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull());
    expect(useAuthStore.getState().authUser?.profilePic).toBe(defaultPic);
  });

  it('ignores a profile response that belongs to another account', () => {
    useAuthStore.getState().updateAuthUser({ ...account, _id: 'someone-else', fullName: 'Eve' });

    expect(useAuthStore.getState().authUser?.fullName).toBe('Ada Lovelace');
  });
});
