import React from 'react';

interface SecretLogoProps {
  variant?: 'full' | 'icon' | 'badge';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  dark?: boolean;
}

export const SecretLogo: React.FC<SecretLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  dark = false,
}) => {
  // Dimension sizing map
  const dimensions = {
    sm: { icon: 28, text: 'text-xs', height: 'h-7' },
    md: { icon: 38, text: 'text-sm', height: 'h-10' },
    lg: { icon: 52, text: 'text-base', height: 'h-14' },
    xl: { icon: 72, text: 'text-xl', height: 'h-20' },
  }[size];

  const iconSize = dimensions.icon;

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* SVG Vector Emblem */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-md transition-transform duration-300 hover:scale-105"
      >
        <defs>
          {/* Main Shield Gradient */}
          <linearGradient id="shieldGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4F46E5" /> {/* Indigo 600 */}
            <stop offset="50%" stopColor="#3730A3" /> {/* Indigo 800 */}
            <stop offset="100%" stopColor="#0F172A" /> {/* Slate 900 */}
          </linearGradient>

          {/* Accent Gold/Amber Gradient */}
          <linearGradient id="goldGrad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F59E0B" /> {/* Amber 500 */}
            <stop offset="100%" stopColor="#D97706" /> {/* Amber 600 */}
          </linearGradient>

          {/* Cyan Energy Glow Gradient */}
          <linearGradient id="cyanGrad" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#06B6D4" /> {/* Cyan 500 */}
            <stop offset="100%" stopColor="#10B981" /> {/* Emerald 500 */}
          </linearGradient>

          {/* Inner Lock Gradient */}
          <linearGradient id="lockGrad" x1="30" y1="30" x2="70" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>

          {/* Soft Glow Shadow */}
          <filter id="glow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#4F46E5" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Outer Hexagonal Shield Frame */}
        <path
          d="M50 8 L85 24 V50 C85 71.5 70 88.5 50 94 C30 88.5 15 71.5 15 50 V24 L50 8 Z"
          fill="url(#shieldGrad)"
          stroke="url(#cyanGrad)"
          strokeWidth="3"
          strokeLinejoin="round"
          filter="url(#glow)"
        />

        {/* Inner Security Vault Ring */}
        <path
          d="M50 16 L78 29.5 V50 C78 67.5 66 82 50 86.5 C34 82 22 67.5 22 50 V29.5 L50 16 Z"
          fill="none"
          stroke="url(#goldGrad)"
          strokeWidth="1.5"
          strokeDasharray="4 2"
          opacity="0.85"
        />

        {/* Financial Growth Chart Bar / Keyhole Emblem */}
        {/* Bar 1 (Low) */}
        <rect x="36" y="52" width="6" height="14" rx="2" fill="url(#cyanGrad)" opacity="0.9" />
        {/* Bar 2 (Medium) */}
        <rect x="47" y="44" width="6" height="22" rx="2" fill="url(#cyanGrad)" />
        {/* Bar 3 (High - Arrow Tip) */}
        <rect x="58" y="36" width="6" height="30" rx="2" fill="url(#goldGrad)" />

        {/* Security Keyhole Overlaid in Center Top */}
        <circle cx="50" cy="35" r="5" fill="url(#lockGrad)" />
        <path
          d="M47.5 37.5 L52.5 37.5 L54 47 L46 47 Z"
          fill="url(#lockGrad)"
        />

        {/* Upward Financial Trend Arrow Signal */}
        <path
          d="M32 58 L45 46 L53 52 L68 34"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M62 34 H68 V40"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Top Secret Badge Stars */}
        <polygon points="50,11 51.5,14 54.5,14 52,16 53,19 50,17 47,19 48,16 45.5,14 48.5,14" fill="#F59E0B" />
      </svg>

      {/* Typography Label */}
      {variant !== 'icon' && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-wider uppercase font-display ${
                dark ? 'text-white' : 'text-slate-900'
              } ${dimensions.text}`}
            >
              Serviço Secreto
            </span>
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 border border-amber-500/30 tracking-widest">
              VIP
            </span>
          </div>
          <span
            className={`font-black tracking-widest text-[10px] uppercase mt-1 ${
              dark ? 'text-cyan-400' : 'text-indigo-600'
            }`}
          >
            Finanças & Gastos
          </span>
        </div>
      )}
    </div>
  );
};

export default SecretLogo;
