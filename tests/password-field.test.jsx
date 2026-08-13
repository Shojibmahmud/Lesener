import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PasswordField from '../src/components/PasswordField';

// Acceptance criterion 7.
describe('the password field can be revealed', () => {
  it('starts hidden, reveals on Show, and hides again on Hide', async () => {
    const user = userEvent.setup();
    render(<PasswordField id="new-password" label="New password" value="Gemüse123" onChange={() => {}} />);

    const field = screen.getByLabelText('New password');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(field).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('reports what the reader typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField id="new-password" label="New password" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('New password'), 'ab');

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not submit the surrounding form when toggling', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordField id="new-password" label="New password" value="x" onChange={() => {}} />
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Show' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
