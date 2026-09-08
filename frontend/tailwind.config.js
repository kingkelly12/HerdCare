/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // High-contrast palette tuned for outdoor / bright-sunlight legibility.
        brand: {
          50: '#EAF5EC',
          100: '#C9E6CE',
          200: '#9FD1A8',
          300: '#6FB87D',
          400: '#469E5A',
          500: '#2C7A3D', // primary actions
          600: '#20602F',
          700: '#194B25',
          800: '#12371B',
          900: '#0B2412',
        },
        earth: {
          50: '#FAF6F0',
          100: '#F0E6D8',
          200: '#DFC9A8',
          300: '#C9A876',
          400: '#B08A4E',
          500: '#8C6A36',
          600: '#6E5229',
          700: '#513C1D',
          800: '#362813',
          900: '#1E160A',
        },
        warning: {
          100: '#FFF1D6',
          400: '#F5A524',
          500: '#DB8A0B',
          600: '#B06F08',
        },
        danger: {
          100: '#FBDADA',
          400: '#E5484D',
          500: '#CE2C31',
          600: '#A81E22',
        },
        ink: {
          50: '#F5F8F4',
          900: '#131A14',
          700: '#33422F',
          500: '#5C6B58',
          300: '#94A190',
          100: '#E4E9E1',
        },
      },
      fontSize: {
        // Bumped baseline sizes for dusty/bright field conditions.
        base: ['17px', '24px'],
        lg: ['20px', '28px'],
        xl: ['24px', '30px'],
        '2xl': ['30px', '36px'],
      },
      spacing: {
        touch: '48px',
      },
    },
  },
  plugins: [],
};
