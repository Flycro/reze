// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // GitHub API responses are loosely typed - allow any for API boundaries
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-dynamic-delete': 'off',
  }
})
