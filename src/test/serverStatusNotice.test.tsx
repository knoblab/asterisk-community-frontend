import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServerStatusNotice } from '../components/common/ServerStatusNotice';
import { ToastContainer } from '../components/ToastContainer';
import { useUIStore } from '../stores/useUIStore';

describe('ServerStatusNotice & Toast Link Rendering', () => {
  it('renders ServerStatusNotice with default message and link to status.knoblab.xyz', () => {
    render(<ServerStatusNotice />);

    expect(screen.getByText('로딩이 되지 않나요?')).toBeDefined();
    const link = screen.getByRole('link', { name: /status\.knoblab\.xyz/i });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders custom message in ServerStatusNotice', () => {
    render(<ServerStatusNotice message="서버 응답이 지연되고 있습니다." />);
    expect(screen.getByText('서버 응답이 지연되고 있습니다.')).toBeDefined();
  });

  it('renders clickable link inside ToastContainer when message contains status.knoblab.xyz', () => {
    useUIStore.setState({
      toasts: [
        {
          id: 'test-toast-1',
          type: 'error',
          message: '서버 통신에 실패했습니다. status.knoblab.xyz에서 서버 상태를 확인해 보세요.',
        },
      ],
    });

    render(<ToastContainer />);

    const link = screen.getByRole('link', { name: 'status.knoblab.xyz' });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('https://status.knoblab.xyz');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
