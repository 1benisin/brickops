# Styling Guidelines

## Styling Approach

BrickOps uses Tailwind CSS with a mobile-first approach and component variants for consistent design patterns.

## Global Theme Variables

```css
/* styles/globals.css - Global theme system */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Brand Colors - Professional Lego-inspired palette */
  --color-primary-500: #3b82f6; /* Primary blue */
  --color-secondary-500: #22c55e; /* Success green */

  /* Status Colors */
  --color-available: #22c55e; /* Green for available inventory */
  --color-sold: #6b7280; /* Gray for sold items */
  --color-reserved: #f59e0b; /* Amber for reserved items */
  --color-picking: #8b5cf6; /* Purple for items being picked */

  /* Spacing Scale - Based on 4px grid */
  --space-4: 1rem; /* 16px */
  --space-8: 2rem; /* 32px */

  /* Border Radius */
  --radius-md: 0.375rem; /* 6px */

  /* Shadows */
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

@layer components {
  .btn-primary {
    @apply bg-primary-600 text-white hover:bg-primary-700 focus:ring-2 focus:ring-primary-500;
  }

  .card {
    @apply bg-white rounded-lg border border-neutral-200 shadow-sm;
  }

  .status-available {
    @apply bg-green-100 text-green-800 ring-green-600/20;
  }

  .inventory-grid {
    @apply grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5;
  }
}
```
