// Simple in-memory cache shared across the app
const cache = new Map<string, { data: any; ts: number }>()
const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

export function useGitHub() {
  const { token } = useAuth()

  async function graphql<T = any>(
    query: string,
    variables: Record<string, any> = {},
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${token.value}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: options?.signal,
    })
    const json = await res.json()
    if (json.errors) {
      throw new Error(json.errors[0]?.message ?? 'GraphQL error')
    }
    return json.data as T
  }

  async function rest<T = any>(
    path: string,
    options?: RequestInit & { signal?: AbortSignal }
  ): Promise<T> {
    const res = await fetch(`https://api.github.com/${path}`, {
      ...options,
      headers: {
        Authorization: `bearer ${token.value}`,
        Accept: 'application/vnd.github.full+json',
        ...options?.headers,
      },
      signal: options?.signal,
    })
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`)
    }
    return res.json()
  }

  /**
   * Cached REST call. Returns cached data if within TTL, otherwise fetches fresh.
   */
  async function restCached<T = any>(
    path: string,
    options?: RequestInit & { signal?: AbortSignal; ttl?: number }
  ): Promise<T> {
    const key = `rest:${path}`
    const cached = cache.get(key)
    const ttl = options?.ttl ?? DEFAULT_TTL
    if (cached && Date.now() - cached.ts < ttl) {
      return cached.data as T
    }
    const data = await rest<T>(path, options)
    cache.set(key, { data, ts: Date.now() })
    return data
  }

  /**
   * Cached GraphQL query. Not for mutations.
   */
  async function graphqlCached<T = any>(
    query: string,
    variables: Record<string, any> = {},
    options?: { signal?: AbortSignal; ttl?: number }
  ): Promise<T> {
    const key = `gql:${query.slice(0, 60)}:${JSON.stringify(variables)}`
    const cached = cache.get(key)
    const ttl = options?.ttl ?? DEFAULT_TTL
    if (cached && Date.now() - cached.ts < ttl) {
      return cached.data as T
    }
    const data = await graphql<T>(query, variables, options)
    cache.set(key, { data, ts: Date.now() })
    return data
  }

  async function graphqlMutation<T = any>(
    query: string,
    variables: Record<string, any> = {}
  ): Promise<T> {
    return graphql<T>(query, variables)
  }

  function clearCache() {
    cache.clear()
  }

  return { graphql, graphqlCached, rest, restCached, graphqlMutation, clearCache }
}
