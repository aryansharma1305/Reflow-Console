/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand Colors from my-frontend
        primary: {
          DEFAULT: '#00A3FF',
          hover: '#008FD9',
        },
        accent: '#32D2FF',
        // Surface Colors
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#ECF3FF',
          hover: '#E2EEFF',
        },
        // Background
        background: '#F7FAFF',
        // Text Colors
        'text-primary': '#0A0F1C',
        'text-secondary': '#344563',
        'text-muted': '#667792',
        'text-inverse': '#FFFFFF',
        // Border Colors
        'border-default': '#D1E0F2',
        'border-subtle': '#E2ECFA',
        'border-focus': '#00A3FF',
        // Status Colors
        success: '#16C79A',
        warning: '#F4B740',
        error: '#F05454',
        info: '#00A3FF',
        // Dashboard specific
        sidebar: '#0A0F1C',
        'sidebar-hover': '#1a1f2e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
