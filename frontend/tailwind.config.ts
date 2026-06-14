import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  theme: {
    extend: {
      colors: {
        chrome: 'rgb(var(--color-chrome) / <alpha-value>)',
        'chrome-border': 'rgb(var(--color-chrome-border) / <alpha-value>)',
        'chrome-fg': 'rgb(var(--color-chrome-fg) / <alpha-value>)',
        'chrome-fg-muted': 'rgb(var(--color-chrome-fg-muted) / <alpha-value>)',
      },
    },
  },
}
