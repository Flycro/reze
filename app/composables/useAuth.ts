export function useAuth() {
  const token = useState<string | null>('github_token', () => {
    if (import.meta.client) {
      return localStorage.getItem('github_token')
    }
    return null
  })

  const isAuthenticated = computed(() => !!token.value)

  function login(newToken: string) {
    localStorage.setItem('github_token', newToken)
    token.value = newToken
  }

  function logout() {
    localStorage.removeItem('github_token')
    localStorage.removeItem('github_viewer_login')
    localStorage.removeItem('github_viewer_avatar')
    token.value = null
    if (import.meta.client) {
      caches.delete('github-api')
      caches.delete('github-avatars')
    }
    navigateTo('/login')
  }

  return { token, isAuthenticated, login, logout }
}
