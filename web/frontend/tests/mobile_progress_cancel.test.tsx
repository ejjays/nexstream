import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileProgress from '../src/components/MobileProgress';

const baseProps = {
  loading: true,
  progress: 42,
  emeProgress: 42,
  subStatus: 'Muxing 42%',
  videoTitle: 'Clip',
  selectedFormat: 'mp4',
  error: '',
};

describe('MobileProgress — cancel button', () => {
  it('shows Cancel during an on-device phase and calls onCancel when clicked', () => {
    const onCancel = vi.fn();
    render(
      <MobileProgress
        {...baseProps}
        status="eme_muxing"
        emePhase="mux"
        onCancel={onCancel}
      />
    );

    const btn = screen.getByRole('button', { name: /cancel on-device/i });
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides Cancel when no on-device phase is active', () => {
    render(
      <MobileProgress
        {...baseProps}
        status="downloading"
        emePhase={null}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: /cancel on-device/i })
    ).toBeNull();
  });

  it('does not render a Cancel button when onCancel is omitted', () => {
    render(
      <MobileProgress {...baseProps} status="eme_muxing" emePhase="mux" />
    );

    expect(
      screen.queryByRole('button', { name: /cancel on-device/i })
    ).toBeNull();
  });
});
