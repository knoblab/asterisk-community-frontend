import React from 'react';

export const ExternalArrowIcon: React.FC<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 12, className = '', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
    style={style}
  >
    <path d="M7 17L17 7" />
    <path d="M7 7h10v10" />
  </svg>
);
