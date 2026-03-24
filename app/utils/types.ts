export interface CardData {
  id: string
  contentId?: string
  title: string
  number?: number
  url?: string
  state?: string
  bodyHTML?: string
  createdAt?: string
  updatedAt?: string
  typename: string
  labels: Array<{ name: string; color: string }>
  assignees: Array<{ login: string; avatarUrl: string }>
  author?: { login: string; avatarUrl: string }
}

export interface ColumnOption {
  id: string
  name: string
  color: string
}

export interface OrgMember {
  login: string
  avatarUrl: string
  nodeId: string
}

export const COLOR_MAP: Record<string, string> = {
  RED: '#f85149',
  ORANGE: '#e3b341',
  YELLOW: '#d29922',
  GREEN: '#3fb950',
  BLUE: '#58a6ff',
  PURPLE: '#bc8cff',
  PINK: '#ff7b72',
  GRAY: '#8b949e',
}
