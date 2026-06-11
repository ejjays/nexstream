import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MobileProgress from '../src/components/MobileProgress';

const MB = 1000 * 1000;

const base = {
  loading: true,
  progress: 50,
  emeProgress: 50,
  subStatus: '',
  videoTitle: 'Clip',
  selectedFormat: 'mp4',
  error: '',
};

describe('MobileProgress — live byte readout', () => {
  it('shows received / total during the download phase', () => {
    render(
      <MobileProgress
        {...base}
        status="eme_downloading"
        emePhase="download"
        emeBytes={{ received: 350 * MB, total: 700 * MB }}
      />
    );
    expect(screen.getByText(/350\.0 MB/)).toBeTruthy();
    expect(screen.getByText(/700\.0 MB/)).toBeTruthy();
  });

  it('hides the byte readout during the mux phase', () => {
    render(
      <MobileProgress
        {...base}
        status="eme_muxing"
        emePhase="mux"
        emeBytes={{ received: 700 * MB, total: 700 * MB }}
      />
    );
    expect(screen.queryByText(/700\.0 MB/)).toBeNull();
  });

  it('hides the byte readout when total is unknown', () => {
    render(
      <MobileProgress
        {...base}
        status="eme_downloading"
        emePhase="download"
        emeBytes={{ received: 10 * MB, total: 0 }}
      />
    );
    expect(screen.queryByText(/MB/)).toBeNull();
  });
});
