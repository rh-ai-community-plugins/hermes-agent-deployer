import React from 'react';

const HermesNavIcon: React.FC<{ style?: React.CSSProperties; className?: string }> = ({ style, className }) => (
  <svg
    style={style}
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="24" height="24" rx="4" fill="#ee0000" />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fill="white"
      fontSize="10"
      fontWeight="bold"
      fontFamily="Red Hat Display, Arial, sans-serif"
    >
      HA
    </text>
  </svg>
);

export default HermesNavIcon;
