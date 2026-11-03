import React from 'react';

interface KnoblabIconProps {
  size?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const KnoblabIcon: React.FC<KnoblabIconProps> = ({
  size = 20,
  color = 'currentColor',
  className,
  style,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 400 400"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <g fill={color}>
      {/* 1. 왼쪽 위 큰 사분원 */}
      <path d="M 200 100 L 200 40 A 160 160 0 0 0 40 200 L 100 200 A 100 100 0 0 1 200 100 Z" />
      {/* 2. 왼쪽 아래 작은 사분원 */}
      <path d="M 200 200 L 100 200 A 100 100 0 0 0 200 300 Z" />
      {/* 3. 오른쪽 위 사각형 */}
      <rect x="200" y="100" width="100" height="100" />
      {/* 4. 오른쪽 아래 큰 사분원 */}
      <path d="M 200 300 L 200 360 A 160 160 0 0 0 360 200 L 300 200 A 100 100 0 0 1 200 300 Z" />
    </g>
  </svg>
);
