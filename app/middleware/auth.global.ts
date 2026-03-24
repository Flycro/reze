export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const { isAuthenticated } = useAuth()

  if (!isAuthenticated.value && to.path !== '/login') {
    return navigateTo('/login')
  }

  if (isAuthenticated.value && to.path === '/login') {
    return navigateTo('/orgs')
  }
})
