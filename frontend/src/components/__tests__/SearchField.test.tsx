import { describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchField from '../SearchField';

function Harness({ onWindowEscape }: { onWindowEscape: () => void }) {
  const [value, setValue] = useState('');
  // Same kind of listener ChatHeader uses to close the conversation.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onWindowEscape(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onWindowEscape]);
  return <SearchField value={value} onChange={setValue} label="Search chats" />;
}

describe('SearchField', () => {
  it('clears with the button and keeps focus in the field', async () => {
    const user = userEvent.setup();
    render(<Harness onWindowEscape={vi.fn()} />);
    const input = screen.getByRole('searchbox', { name: 'Search chats' });

    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await user.type(input, 'anna');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('uses Escape to clear the query before it can close the conversation', async () => {
    const user = userEvent.setup();
    const onWindowEscape = vi.fn();
    render(<Harness onWindowEscape={onWindowEscape} />);
    const input = screen.getByRole('searchbox', { name: 'Search chats' });

    await user.type(input, 'anna');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(onWindowEscape).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onWindowEscape).toHaveBeenCalledOnce();
  });
});
