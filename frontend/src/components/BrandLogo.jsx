const BrandLogo = ({ className = 'h-10 w-10' }) => (
  <svg
    className={className}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="AutoInsights logo"
  >
    <defs>
      <linearGradient id="autoInsightsGradient" x1="7" y1="5" x2="42" y2="44" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1D4ED8" />
        <stop offset="1" stopColor="#0F766E" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#autoInsightsGradient)" />
    <rect x="1.5" y="1.5" width="45" height="45" rx="12.5" stroke="#FFFFFF" strokeOpacity="0.16" />
    <path
      d="M10.5 31.5A13.5 13.5 0 0 1 37.5 31.5"
      stroke="white"
      strokeWidth="3.4"
      strokeLinecap="round"
    />
    <path
      d="M13.2 27.1L10.8 25.7M17.4 22.8L16 20.4M24 21.1V18.3M30.6 22.8L32 20.4M34.8 27.1L37.2 25.7"
      stroke="white"
      strokeOpacity="0.72"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path d="M24 31.2L31.4 22.7" stroke="#99F6E4" strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="24" cy="31.2" r="3" fill="white" />
    <circle cx="24" cy="31.2" r="1.4" fill="#0F766E" />
    <rect x="12.5" y="34" width="23" height="7" rx="2.2" fill="white" />
    <text x="24" y="39.2" textAnchor="middle" fill="#0F172A" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="5.4" fontWeight="800" letterSpacing="0.8">01234</text>
  </svg>
);

export default BrandLogo;
