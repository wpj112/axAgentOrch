interface BrandMarkProps {
  size?: number
}

function BrandMark({ size = 32 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="brand-bg" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#162847" />
          <stop offset="1" stopColor="#0d1730" />
        </linearGradient>
        <linearGradient id="brand-stroke" x1="8" y1="6" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9ad8ff" />
          <stop offset="1" stopColor="#53b7ff" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="8" fill="url(#brand-bg)" stroke="rgba(154,216,255,0.22)" />
      <path d="M16 8.5V14.2" stroke="url(#brand-stroke)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 14.2L10.2 20" stroke="url(#brand-stroke)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 14.2L21.8 20" stroke="url(#brand-stroke)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 14.2V20.2" stroke="url(#brand-stroke)" strokeWidth="1.4" strokeLinecap="round" opacity="0.72" />
      <circle cx="16" cy="8.5" r="2.4" fill="#252836" stroke="#9ad8ff" strokeWidth="1.6" />
      <circle cx="10.2" cy="20.2" r="2.4" fill="#252836" stroke="#9ad8ff" strokeWidth="1.6" />
      <circle cx="21.8" cy="20.2" r="2.4" fill="#252836" stroke="#9ad8ff" strokeWidth="1.6" />
      <path d="M12.4 8.9C12.8 7 14.2 5.7 16 5.7C17.8 5.7 19.2 7 19.6 8.9" stroke="#53b7ff" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

export default BrandMark
