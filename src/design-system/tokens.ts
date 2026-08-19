export const goWorkoraTokens = {
  color: {
    black: "#111318",
    gold: "#FFB000",
    goldHover: "#E69D00",
    white: "#FFFFFF",
    cloud: "#F7F8FA",
    gray100: "#ECEEF2",
    gray200: "#D9DDE5",
    textPrimary: "#111318",
    textSecondary: "#4B5563",
    textMuted: "#6B7280",
    success: "#16A34A",
    warning: "#D97706",
    error: "#DC2626",
    info: "#2563EB",
  },
  font: {
    display: '"Geist", "Inter Tight", "Manrope", system-ui, sans-serif',
    body: '"Inter", "Manrope", "Geist", system-ui, sans-serif',
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    6: "24px",
    8: "32px",
    12: "48px",
    16: "64px",
    24: "96px",
  },
  radius: {
    small: "8px",
    input: "12px",
    card: "16px",
    section: "24px",
    round: "999px",
  },
  shadow: {
    card: "0 8px 30px rgba(17, 19, 24, 0.08)",
    hover: "0 12px 36px rgba(17, 19, 24, 0.12)",
    dialog: "0 24px 70px rgba(17, 19, 24, 0.20)",
  },
  layout: {
    maxWidth: "1280px",
    desktopColumns: 12,
    tabletColumns: 8,
    mobileColumns: 4,
  },
  motion: {
    fast: "160ms",
    standard: "220ms",
  },
} as const;

export type GoWorkoraTokens = typeof goWorkoraTokens;
