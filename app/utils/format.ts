export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffDay > 30) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diffDay > 0) return `${diffDay}d ago`
  const diffHour = Math.floor(diffMs / 3600000)
  if (diffHour > 0) return `${diffHour}h ago`
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin > 0) return `${diffMin}m ago`
  return 'just now'
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function repoFromUrl(url?: string): string | null {
  const match = url?.match(/github\.com\/[^/]+\/([^/]+)\//)
  return match ? match[1] : null
}

export function parseRepoFromUrl(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2], number: parseInt(match[4]) }
}
