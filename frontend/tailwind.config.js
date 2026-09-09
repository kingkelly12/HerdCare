/** @type {import('tailwindcss').Config} */

// Colours resolve through CSS variables declared in global.css, so a single token swap drives
// the whole dark theme. `<alpha-value>` keeps utilities like `bg-brand/10` working.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        sunken: token('sunken'),
        line: token('border'),
        'line-strong': token('border-strong'),
        primary: token('primary-text'),
        secondary: token('secondary-text'),
        tertiary: token('tertiary-text'),
        inverse: token('inverse-text'),
        brand: token('brand'),
        'brand-strong': token('brand-strong'),
        'brand-soft': token('brand-soft'),
        'on-brand': token('on-brand'),
        earth: token('earth'),
        'earth-soft': token('earth-soft'),
        warn: token('warn'),
        'warn-soft': token('warn-soft'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
      },
      fontFamily: {
        // React Native cannot synthesise weights from one file, so each weight is its own family.
        // Named to avoid colliding with Tailwind's `font-medium`/`font-bold` weight utilities.
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
      },
      fontSize: {
        // Sizes stay large for gloved hands and glare; tracking tightens as size grows, which is
        // what stops big text reading as merely "zoomed".
        display: ['34px', { lineHeight: '38px', letterSpacing: '-0.9px' }],
        title: ['26px', { lineHeight: '31px', letterSpacing: '-0.6px' }],
        headline: ['20px', { lineHeight: '26px', letterSpacing: '-0.3px' }],
        body: ['17px', { lineHeight: '24px', letterSpacing: '-0.1px' }],
        callout: ['15px', { lineHeight: '21px', letterSpacing: '0px' }],
        label: ['13px', { lineHeight: '18px', letterSpacing: '0.1px' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.3px' }],
        // Metric readouts: large, tight, and unmistakable at a glance.
        metric: ['30px', { lineHeight: '34px', letterSpacing: '-1px' }],
      },
      spacing: {
        touch: '48px',
      },
      borderRadius: {
        card: '18px',
        field: '14px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
