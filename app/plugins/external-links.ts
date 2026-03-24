import { vExternalLinks } from '~/utils/directives'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('external-links', vExternalLinks)
})
