<script setup lang="ts">
import { KANBAN_BOARD_QUERY, ITEMS_PAGE_QUERY, MOVE_CARD_MUTATION, PROJECT_LIST_QUERY } from '~/utils/queries'
import type { CardData, ColumnOption } from '~/utils/types'
import { adaptQuery, getOwner, ownerPath } from '~/utils/owner'

const route = useRoute()
const router = useRouter()
const { ownerType, ownerLogin } = useOwner()
const org = ownerLogin.value
const projectNumber = parseInt((route.params.number as string), 10)
const { graphql, graphqlCached, graphqlMutation } = useGitHub()

const projectTitle = ref('')
const appVersion = useRuntimeConfig().public.version as string

useHead({ title: computed(() => projectTitle.value ? `reze - ${projectTitle.value}` : `reze - ${org}`) })
const projectId = ref('')
const statusFieldId = ref('')
const columns = ref<ColumnOption[]>([])
const allCards = shallowRef<CardData[]>([])
const itemColumnMap = shallowRef<Record<string, string | null>>({})
const pending = shallowRef<Record<string, string>>({})
const isFetchingMore = ref(false)
const totalCount = ref(0)
const loading = ref(true)
const selectedCard = ref<CardData | null>(null)
const sidebarOpen = ref(false)

const siblingProjects = ref<Array<{ number: number; title: string }>>([])

onMounted(async () => {
  try {
    const data = await graphqlCached<any>(adaptQuery(PROJECT_LIST_QUERY, ownerType.value), { org })
    const owner = getOwner(data, ownerType.value)
    siblingProjects.value = (owner?.projectsV2?.nodes ?? [])
      .filter((p: any) => p && !p.closed)
      .map((p: any) => ({ number: p.number, title: p.title }))
  } catch { /* non-critical */ }
})

const boardRepos = computed(() => {
  const map = new Map<string, number>()
  for (const card of allCards.value) {
    const repo = repoFromUrl(card.url)
    if (repo) {
      map.set(repo, (map.get(repo) ?? 0) + 1)
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
})

// URL: ?users=a,b&repos=x,y&xUsers=c&xRepos=z&unassigned=1

function parseList(val: unknown): string[] {
  if (!val) return []
  return String(val).split(',').filter(Boolean)
}

const filterUsers = computed(() => parseList(route.query.users))
const filterRepos = computed(() => parseList(route.query.repos))
const excludeUsers = computed(() => parseList(route.query.xUsers))
const excludeRepos = computed(() => parseList(route.query.xRepos))
const filterUnassigned = computed(() => route.query.unassigned === '1')

const hasAnyFilter = computed(() =>
  filterUsers.value.length > 0 || filterRepos.value.length > 0 ||
  excludeUsers.value.length > 0 || excludeRepos.value.length > 0 ||
  filterUnassigned.value
)

function setQuery(updates: Record<string, string[] | string | undefined>) {
  const query: Record<string, string> = {}
  const merged = { ...route.query, ...Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
  )}
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== '') query[k] = String(v)
  }
  router.replace({ query })
}

function handleUserClick(login: string, e?: MouseEvent) {
  const users = [...filterUsers.value]
  const xUsers = [...excludeUsers.value]

  if (e?.shiftKey) {
    const idx = xUsers.indexOf(login)
    if (idx >= 0) { xUsers.splice(idx, 1) }
    else { xUsers.push(login) }
    const iIdx = users.indexOf(login)
    if (iIdx >= 0) users.splice(iIdx, 1)
    setQuery({
      users: users.length ? users : undefined,
      xUsers: xUsers.length ? xUsers : undefined,
    })
  } else if (e?.metaKey || e?.ctrlKey) {
    const idx = users.indexOf(login)
    if (idx >= 0) { users.splice(idx, 1) }
    else { users.push(login) }
    const xIdx = xUsers.indexOf(login)
    if (xIdx >= 0) xUsers.splice(xIdx, 1)
    setQuery({
      users: users.length ? users : undefined,
      xUsers: xUsers.length ? xUsers : undefined,
      unassigned: undefined,
    })
  } else {
    if (users.length === 1 && users[0] === login && xUsers.length === 0) {
      setQuery({ users: undefined, unassigned: undefined })
    } else {
      setQuery({ users: [login], xUsers: undefined, unassigned: undefined })
    }
  }
}

function handleRepoClick(repo: string, e?: MouseEvent) {
  const repos = [...filterRepos.value]
  const xRepos = [...excludeRepos.value]

  if (e?.shiftKey) {
    const idx = xRepos.indexOf(repo)
    if (idx >= 0) { xRepos.splice(idx, 1) }
    else { xRepos.push(repo) }
    const iIdx = repos.indexOf(repo)
    if (iIdx >= 0) repos.splice(iIdx, 1)
    setQuery({
      repos: repos.length ? repos : undefined,
      xRepos: xRepos.length ? xRepos : undefined,
    })
  } else if (e?.metaKey || e?.ctrlKey) {
    const idx = repos.indexOf(repo)
    if (idx >= 0) { repos.splice(idx, 1) }
    else { repos.push(repo) }
    const xIdx = xRepos.indexOf(repo)
    if (xIdx >= 0) xRepos.splice(xIdx, 1)
    setQuery({
      repos: repos.length ? repos : undefined,
      xRepos: xRepos.length ? xRepos : undefined,
    })
  } else {
    if (repos.length === 1 && repos[0] === repo && xRepos.length === 0) {
      setQuery({ repos: undefined })
    } else {
      setQuery({ repos: [repo], xRepos: undefined })
    }
  }
}

function toggleUnassigned() {
  setQuery({
    unassigned: filterUnassigned.value ? undefined : '1',
    users: undefined,
    xUsers: undefined,
  })
}

type SortMode = 'default' | 'updated' | 'created' | 'title'
const SORT_OPTIONS = [
  { label: 'GitHub default', value: 'default' },
  { label: 'Last updated', value: 'updated' },
  { label: 'Newest first', value: 'created' },
  { label: 'Title A-Z', value: 'title' },
]

const SORT_STORAGE_KEY = `reze-sort-${org}-${projectNumber}`
const sortMode = ref<SortMode>('default')
const columnSorts = ref<Record<string, SortMode>>({})

onMounted(() => {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      sortMode.value = parsed.global ?? 'default'
      columnSorts.value = parsed.columns ?? {}
    }
  } catch { /* ignore */ }
})

function persistSort() {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({
    global: sortMode.value,
    columns: columnSorts.value,
  }))
}

watch(sortMode, persistSort)
watch(columnSorts, persistSort, { deep: true })

function getColumnSort(colId: string): SortMode {
  return columnSorts.value[colId] ?? sortMode.value
}

function setColumnSort(colId: string, mode: SortMode) {
  if (mode === sortMode.value) {
    const next = { ...columnSorts.value }
    delete next[colId]
    columnSorts.value = next
  } else {
    columnSorts.value = { ...columnSorts.value, [colId]: mode }
  }
}

function applySortToCards(cards: CardData[], mode: SortMode): CardData[] {
  if (mode === 'default') return cards
  return [...cards].sort((a, b) => {
    if (mode === 'updated') return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    if (mode === 'created') return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    if (mode === 'title') return a.title.localeCompare(b.title)
    return 0
  })
}

function resetSort() {
  sortMode.value = 'default'
  columnSorts.value = {}
  localStorage.removeItem(SORT_STORAGE_KEY)
}

function clearFilter() {
  router.replace({ query: {} })
}

function userState(login: string): 'include' | 'exclude' | 'none' {
  if (filterUsers.value.includes(login)) return 'include'
  if (excludeUsers.value.includes(login)) return 'exclude'
  return 'none'
}

function repoState(name: string): 'include' | 'exclude' | 'none' {
  if (filterRepos.value.includes(name)) return 'include'
  if (excludeRepos.value.includes(name)) return 'exclude'
  return 'none'
}

function setUserFilter(login: string) { handleUserClick(login) }
function setRepoFilter(repo: string) { handleRepoClick(repo) }
function toggleUserFilter(login: string) { handleUserClick(login) }

const viewerLogin = ref<string | null>(null)
const viewerAvatar = ref<string | null>(null)

const teamSearch = ref('')
const repoSearch = ref('')
const showAllTeam = ref(false)
const showAllRepos = ref(false)
const SIDEBAR_LIMIT = 8
const modKey = import.meta.client && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'
const filterHint = `Click to filter · ${modKey}+click to add · Shift+click to exclude`

// Bang patterns: @user, /repo, >action, #number
const searchTerm = ref('')

const bangPrefix = computed(() => {
  const t = searchTerm.value
  if (t.startsWith('@')) return '@'
  if (t.startsWith('/')) return '/'
  if (t.startsWith('>')) return '>'
  if (t.startsWith('#')) return '#'
  return null
})

function filterByQuery(items: any[], query: string) {
  if (!query) return items
  const q = query.toLowerCase()
  return items.filter((item: any) => item.label?.toLowerCase().includes(q))
}

const searchGroups = computed(() => {
  const bang = bangPrefix.value
  const bangQuery = bang ? searchTerm.value.slice(1).trim() : ''
  const groups: any[] = []

  const actionItems = [
    { id: 'create-issue', label: 'Create new issue', icon: 'i-lucide-plus', kbds: ['C'], onSelect: () => { showCreateIssue.value = true } },
    { id: 'filter-mine', label: 'Show my items', icon: 'i-lucide-user', onSelect: () => viewerLogin.value && toggleUserFilter(viewerLogin.value) },
    { id: 'filter-unassigned', label: 'Show unassigned', icon: 'i-lucide-user-x', onSelect: toggleUnassigned },
    { id: 'filter-clear', label: 'Clear all filters', icon: 'i-lucide-x', kbds: ['X'], onSelect: clearFilter },
      { id: 'sort-reset', label: 'Reset all sorting', icon: 'i-lucide-rotate-ccw', onSelect: resetSort },
    { id: 'nav-projects', label: 'Back to projects', icon: 'i-lucide-arrow-left', onSelect: () => navigateTo(ownerPath(ownerType.value, org)) },
  ]

  const teamItems = boardAssignees.value.map(user => ({
    id: `user-${user.login}`,
    label: user.login,
    suffix: `${user.count} items`,
    avatar: { src: user.avatarUrl, alt: user.login },
    onSelect() { setUserFilter(user.login) }
  }))

  const repoItems = boardRepos.value.map(repo => ({
    id: `repo-${repo.name}`,
    label: repo.name,
    suffix: `${repo.count} items`,
    icon: 'i-lucide-git-fork',
    onSelect() { setRepoFilter(repo.name) }
  }))

  const cardItems = allCards.value.map(card => {
    const repo = repoFromUrl(card.url)
    const parts = [repo, card.number !== undefined ? `#${card.number}` : null].filter(Boolean)
    return {
      id: card.id,
      label: card.title,
      suffix: parts.length > 0 ? parts.join(' ') : undefined,
      icon: card.typename === 'PullRequest' ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot',
      _number: card.number,
      onSelect() { handleSelect(card) }
    }
  })

  if (bang === '>') {
    groups.push({ id: 'actions', label: 'Actions', ignoreFilter: true, items: filterByQuery(actionItems, bangQuery) })
  } else if (bang === '@') {
    groups.push({ id: 'team', label: 'Team', ignoreFilter: true, items: filterByQuery(teamItems, bangQuery) })
  } else if (bang === '/') {
    groups.push({ id: 'repos', label: 'Repos', ignoreFilter: true, items: filterByQuery(repoItems, bangQuery) })
  } else if (bang === '#') {
    const q = bangQuery
    const filtered = q
      ? cardItems.filter(item => item._number !== undefined && String(item._number).includes(q))
      : cardItems.slice(0, 20)
    groups.push({ id: 'cards', label: 'Cards', ignoreFilter: true, items: filtered })
  } else {
    groups.push({ id: 'actions', label: 'Actions  ›', items: actionItems })
    if (teamItems.length > 0) groups.push({ id: 'team', label: 'Team  @', items: teamItems })
    if (repoItems.length > 1) groups.push({ id: 'repos', label: 'Repos  /', items: repoItems })
    if (cardItems.length > 0) groups.push({ id: 'cards', label: 'Cards  #', items: cardItems })
  }

  return groups
})

onMounted(() => {
  viewerLogin.value = localStorage.getItem('github_viewer_login')
  viewerAvatar.value = localStorage.getItem('github_viewer_avatar')
})

const boardAssignees = computed(() => {
  const map = new Map<string, { login: string; avatarUrl: string; count: number }>()
  for (const card of allCards.value) {
    for (const a of card.assignees) {
      const existing = map.get(a.login)
      if (existing) {
        existing.count++
      } else {
        map.set(a.login, { login: a.login, avatarUrl: a.avatarUrl, count: 1 })
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.login === viewerLogin.value) return -1
    if (b.login === viewerLogin.value) return 1
    return b.count - a.count
  })
})

const searchedTeam = computed(() => {
  const q = teamSearch.value.toLowerCase()
  if (!q) return boardAssignees.value
  return boardAssignees.value.filter(u => u.login.toLowerCase().includes(q))
})

const filteredTeam = computed(() => {
  if (showAllTeam.value || teamSearch.value) return searchedTeam.value
  return searchedTeam.value.slice(0, SIDEBAR_LIMIT)
})

const hasMoreTeam = computed(() => !teamSearch.value && searchedTeam.value.length > SIDEBAR_LIMIT)

const searchedRepos = computed(() => {
  const q = repoSearch.value.toLowerCase()
  if (!q) return boardRepos.value
  return boardRepos.value.filter(r => r.name.toLowerCase().includes(q))
})

const filteredRepos = computed(() => {
  if (showAllRepos.value || repoSearch.value) return searchedRepos.value
  return searchedRepos.value.slice(0, SIDEBAR_LIMIT)
})

const hasMoreRepos = computed(() => !repoSearch.value && searchedRepos.value.length > SIDEBAR_LIMIT)

const myItemsCount = computed(() => {
  if (!viewerLogin.value) return 0
  const login = viewerLogin.value
  return allCards.value.filter(c => c.assignees.some(a => a.login === login)).length
})
const unassignedCount = computed(() =>
  allCards.value.filter(c => c.assignees.length === 0).length
)

const filteredCards = computed(() => {
  let cards = allCards.value

  if (filterRepos.value.length > 0) {
    const repos = new Set(filterRepos.value)
    cards = cards.filter(c => { const r = repoFromUrl(c.url); return r && repos.has(r) })
  }

  if (excludeRepos.value.length > 0) {
    const repos = new Set(excludeRepos.value)
    cards = cards.filter(c => { const r = repoFromUrl(c.url); return !r || !repos.has(r) })
  }

  if (filterUsers.value.length > 0) {
    const logins = new Set(filterUsers.value)
    cards = cards.filter(c => c.assignees.some(a => logins.has(a.login)))
  } else if (filterUnassigned.value) {
    cards = cards.filter(c => c.assignees.length === 0)
  }

  if (excludeUsers.value.length > 0) {
    const logins = new Set(excludeUsers.value)
    cards = cards.filter(c => !c.assignees.some(a => logins.has(a.login)))
  }

  return cards
})

interface FilterChip {
  label: string
  icon: string
  avatar?: string
  type: 'include' | 'exclude'
  category: 'user' | 'repo' | 'status'
  remove: () => void
}

const activeFilterChips = computed(() => {
  const chips: FilterChip[] = []

  for (const user of filterUsers.value) {
    const assignee = boardAssignees.value.find(a => a.login === user)
    chips.push({ label: user, icon: 'i-lucide-user', avatar: assignee?.avatarUrl, type: 'include', category: 'user', remove: () => {
      setQuery({ users: filterUsers.value.filter(u => u !== user) || undefined })
    }})
  }
  for (const user of excludeUsers.value) {
    const assignee = boardAssignees.value.find(a => a.login === user)
    chips.push({ label: user, icon: 'i-lucide-user-x', avatar: assignee?.avatarUrl, type: 'exclude', category: 'user', remove: () => {
      setQuery({ xUsers: excludeUsers.value.filter(u => u !== user) || undefined })
    }})
  }
  if (filterUnassigned.value) {
    chips.push({ label: 'Unassigned', icon: 'i-lucide-user-x', type: 'include', category: 'status', remove: () => {
      setQuery({ unassigned: undefined })
    }})
  }
  for (const repo of filterRepos.value) {
    chips.push({ label: repo, icon: 'i-lucide-git-fork', type: 'include', category: 'repo', remove: () => {
      setQuery({ repos: filterRepos.value.filter(r => r !== repo) || undefined })
    }})
  }
  for (const repo of excludeRepos.value) {
    chips.push({ label: repo, icon: 'i-lucide-git-fork', type: 'exclude', category: 'repo', remove: () => {
      setQuery({ xRepos: excludeRepos.value.filter(r => r !== repo) || undefined })
    }})
  }
  return chips
})

const cardsByColumn = computed(() => {
  const map = new Map<string | '__no_status__', CardData[]>()
  map.set('__no_status__', [])
  for (const col of columns.value) {
    map.set(col.id, [])
  }
  for (const card of filteredCards.value) {
    const colId = pending.value[card.id] ?? itemColumnMap.value[card.id]
    if (colId && map.has(colId)) {
      map.get(colId)!.push(card)
    } else if (!colId) {
      map.get('__no_status__')!.push(card)
    }
  }
  for (const [key, cards] of map) {
    const mode = getColumnSort(key as string)
    if (mode !== 'default') {
      map.set(key, applySortToCards(cards, mode))
    }
  }
  return map
})

const noStatusCards = computed(() => cardsByColumn.value.get('__no_status__') ?? [])

function cardsForColumn(colId: string) {
  return cardsByColumn.value.get(colId) ?? []
}

const currentColumnId = computed(() => {
  if (!selectedCard.value) return null
  return pending.value[selectedCard.value.id] ?? itemColumnMap.value[selectedCard.value.id] ?? null
})

const assigneeCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const c of allCards.value) {
    for (const a of c.assignees) {
      counts.set(a.login, (counts.get(a.login) ?? 0) + 1)
    }
  }
  return counts
})

interface RawItem {
  id: string
  fieldValues: { nodes: Array<any> }
  content: any
}

function rawItemToCard(item: RawItem): CardData | null {
  const content = item.content
  if (!content) return null

  let title = '', contentId: string | undefined, number: number | undefined
  let url: string | undefined, state: string | undefined, bodyHTML: string | undefined
  let createdAt: string | undefined, updatedAt: string | undefined
  let labels: CardData['labels'] = [], assignees: CardData['assignees'] = []
  let author: CardData['author']

  if (content.__typename === 'Issue') {
    contentId = content.id; title = content.title ?? ''; number = content.number; url = content.url
    state = content.issueState; bodyHTML = content.bodyHTML ?? undefined
    createdAt = content.createdAt; updatedAt = content.updatedAt
    author = content.author ? { login: content.author.login, avatarUrl: content.author.avatarUrl } : undefined
    labels = (content.labels?.nodes ?? []).filter(Boolean).map((l: any) => ({ name: l.name, color: l.color }))
    assignees = (content.assignees?.nodes ?? []).filter(Boolean).map((a: any) => ({ login: a.login, avatarUrl: a.avatarUrl }))
  } else if (content.__typename === 'PullRequest') {
    contentId = content.id; title = content.title ?? ''; number = content.number; url = content.url
    state = content.prState; bodyHTML = content.bodyHTML ?? undefined
    createdAt = content.createdAt; updatedAt = content.updatedAt
    author = content.author ? { login: content.author.login, avatarUrl: content.author.avatarUrl } : undefined
    labels = (content.labels?.nodes ?? []).filter(Boolean).map((l: any) => ({ name: l.name, color: l.color }))
    assignees = (content.assignees?.nodes ?? []).filter(Boolean).map((a: any) => ({ login: a.login, avatarUrl: a.avatarUrl }))
  } else if (content.__typename === 'DraftIssue') {
    title = content.title ?? ''; bodyHTML = content.bodyHTML ?? undefined
  } else {
    return null
  }

  return { id: item.id, contentId, title, number, url, state, bodyHTML, createdAt, updatedAt, typename: content.__typename, labels, assignees, author }
}

function processItems(rawItems: RawItem[], sfId: string) {
  const cards: CardData[] = []
  const colMap: Record<string, string | null> = {}

  for (const item of rawItems) {
    const card = rawItemToCard(item)
    if (card) cards.push(card)

    const statusValue = (item.fieldValues.nodes ?? []).find(
      (fv: any) => fv?.__typename === 'ProjectV2ItemFieldSingleSelectValue' &&
        fv.field && fv.field.id === sfId
    )
    colMap[item.id] = statusValue?.optionId ?? null
  }

  return { cards, colMap }
}

async function loadBoard() {
  loading.value = true
  isFetchingMore.value = false
  try {
    const data = await graphql<any>(adaptQuery(KANBAN_BOARD_QUERY, ownerType.value), { org, number: projectNumber })
    const project = getOwner(data, ownerType.value)?.projectV2
    if (!project) return

    projectTitle.value = project.title
    projectId.value = project.id
    totalCount.value = project.items.totalCount

    const sf = project.fields.nodes?.find(
      (f: any) => f?.__typename === 'ProjectV2SingleSelectField' && f.name === 'Status'
    ) ?? project.fields.nodes?.find((f: any) => f?.__typename === 'ProjectV2SingleSelectField')

    if (!sf || sf.__typename !== 'ProjectV2SingleSelectField') return

    statusFieldId.value = sf.id
    columns.value = sf.options.filter(Boolean)

    const rawItems: RawItem[] = (project.items.nodes ?? []).filter(Boolean)
    const { cards, colMap } = processItems(rawItems, sf.id)
    allCards.value = cards
    itemColumnMap.value = colMap

    if (project.items.pageInfo.hasNextPage) {
      isFetchingMore.value = true
      let cursor = project.items.pageInfo.endCursor
      let hasNext = project.items.pageInfo.hasNextPage
      const accCards: CardData[] = [...cards]
      const accColMap: Record<string, string | null> = { ...colMap }

      while (hasNext && cursor) {
        const pageData = await graphql<any>(adaptQuery(ITEMS_PAGE_QUERY, ownerType.value), { org, number: projectNumber, cursor })
        const page = getOwner(pageData, ownerType.value)?.projectV2?.items
        if (!page) break

        const moreRaw: RawItem[] = (page.nodes ?? []).filter(Boolean)
        const { cards: moreCards, colMap: moreColMap } = processItems(moreRaw, sf.id)
        accCards.push(...moreCards)
        Object.assign(accColMap, moreColMap)

        allCards.value = [...accCards]
        itemColumnMap.value = { ...accColMap }

        hasNext = page.pageInfo.hasNextPage
        cursor = page.pageInfo.endCursor
      }
      isFetchingMore.value = false
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadBoard)

async function handleMove(itemId: string, toColumnId: string) {
  pending.value = { ...pending.value, [itemId]: toColumnId }

  try {
    await graphqlMutation(MOVE_CARD_MUTATION, {
      projectId: projectId.value,
      itemId,
      fieldId: statusFieldId.value,
      optionId: toColumnId,
    })
    itemColumnMap.value = { ...itemColumnMap.value, [itemId]: toColumnId }
  } finally {
    const next = { ...pending.value }
    delete next[itemId]
    pending.value = next
  }
}

function handleDrop(cardId: string, columnId: string) {
  const currentCol = pending.value[cardId] ?? itemColumnMap.value[cardId]
  if (currentCol === columnId) return
  handleMove(cardId, columnId)
}

function handleAssigneesChanged(cardId: string, assignees: CardData['assignees']) {
  allCards.value = allCards.value.map(c =>
    c.id === cardId ? { ...c, assignees } : c
  )
}

function handleSelect(card: CardData) {
  if (selectedCard.value?.id === card.id) {
    selectedCard.value = null
    sidebarOpen.value = false
  } else {
    selectedCard.value = card
    sidebarOpen.value = true
    for (let ci = 0; ci < visibleColumns.value.length; ci++) {
      const col = visibleColumns.value[ci]
      const cardIdx = col.cards.findIndex(c => c.id === card.id)
      if (cardIdx >= 0) {
        focusedColumnIndex.value = ci
        focusedCardIndex.value = cardIdx
        break
      }
    }
  }
}

function closeSidebar() {
  selectedCard.value = null
  sidebarOpen.value = false
}

const showCreateIssue = ref(false)
const showShortcuts = ref(false)

const focusedColumnIndex = ref(0)
const focusedCardIndex = ref(0)

const visibleColumns = computed(() => {
  const cols: Array<{ id: string; cards: CardData[] }> = []
  const noStatus = noStatusCards.value
  if (noStatus.length > 0) cols.push({ id: '__no_status__', cards: noStatus })
  for (const col of columns.value) {
    const cards = cardsForColumn(col.id)
    if (cards.length > 0) cols.push({ id: col.id, cards })
  }
  return cols
})

function navigateToCard(colIdx: number, cardIdx: number) {
  const col = visibleColumns.value[colIdx]
  if (!col) return
  const card = col.cards[cardIdx]
  if (!card) return
  focusedColumnIndex.value = colIdx
  focusedCardIndex.value = cardIdx
  handleSelect(card)
}

onMounted(() => {
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    const meta = e.metaKey || e.ctrlKey
    const plain = !meta && !e.altKey


    // ⌘+A = Assign to me (when card is open)
    if (meta && e.key === 'a' && selectedCard.value && !isInput) {
      window.dispatchEvent(new CustomEvent('reze:assign-me'))
      e.preventDefault()
      return
    }

    // ⌘+M = Focus "Move to" select (when card is open)
    if (meta && e.key === 'm' && selectedCard.value && !isInput) {
      const select = document.getElementById('move-to')
      if (select) { select.focus(); select.click() }
      e.preventDefault()
      return
    }

    // ⌘+P = Move to "In Progress" column (when card is open)
    if (meta && e.key === 'p' && selectedCard.value && !isInput) {
      e.preventDefault()
      const progressCol = columns.value.find(c =>
        c.name.toLowerCase().includes('progress') || c.name.toLowerCase().includes('in progress')
      )
      if (progressCol) {
        const currentCol = pending.value[selectedCard.value.id] ?? itemColumnMap.value[selectedCard.value.id]
        if (currentCol !== progressCol.id) {
          handleMove(selectedCard.value.id, progressCol.id)
        }
      }
      return
    }

    if (isInput) return

    // A = Open assignee picker (when card is open)
    if (e.key === 'a' && plain && selectedCard.value) {
      window.dispatchEvent(new CustomEvent('reze:open-assignees'))
      e.preventDefault()
      return
    }

    // E = Focus comment textarea (when card is open)
    if (plain && e.key === 'e' && selectedCard.value) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('reze:focus-comment'))
      return
    }

    // C = Create issue
    if (plain && e.key === 'c') {
      e.preventDefault()
      showCreateIssue.value = true
      return
    }

    // X = Clear filters
    if (plain && e.key === 'x' && hasAnyFilter.value) {
      e.preventDefault()
      clearFilter()
      return
    }

    // F = Toggle "My Items" filter
    if (plain && e.key === 'f' && viewerLogin.value) {
      e.preventDefault()
      toggleUserFilter(viewerLogin.value)
      return
    }

    // R = Refresh board
    if (plain && e.key === 'r') {
      e.preventDefault()
      loadBoard()
      return
    }

    // ? = Show shortcuts
    if (e.key === '?') {
      e.preventDefault()
      showShortcuts.value = !showShortcuts.value
      return
    }

    // Escape = Close sidebar > clear filters
    if (e.key === 'Escape') {
      if (showShortcuts.value) { showShortcuts.value = false; return }
      if (selectedCard.value) { closeSidebar(); return }
      if (hasAnyFilter.value) { clearFilter(); return }
      return
    }

    // J = Next card in column
    if (plain && (e.key === 'j' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const col = visibleColumns.value[focusedColumnIndex.value]
      if (!col) return
      const next = Math.min(focusedCardIndex.value + 1, col.cards.length - 1)
      navigateToCard(focusedColumnIndex.value, next)
      return
    }

    // K = Previous card in column
    if (plain && (e.key === 'k' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const prev = Math.max(focusedCardIndex.value - 1, 0)
      navigateToCard(focusedColumnIndex.value, prev)
      return
    }

    // → = Next column
    if (e.key === 'ArrowRight' && !isInput) {
      e.preventDefault()
      const next = Math.min(focusedColumnIndex.value + 1, visibleColumns.value.length - 1)
      focusedColumnIndex.value = next
      focusedCardIndex.value = 0
      const col = visibleColumns.value[next]
      if (col?.cards[0]) handleSelect(col.cards[0])
      return
    }

    // ← = Previous column
    if (e.key === 'ArrowLeft' && !isInput) {
      e.preventDefault()
      const prev = Math.max(focusedColumnIndex.value - 1, 0)
      focusedColumnIndex.value = prev
      focusedCardIndex.value = 0
      const col = visibleColumns.value[prev]
      if (col?.cards[0]) handleSelect(col.cards[0])
      return
    }
  }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})

function handleIssueCreated(card: CardData, columnId: string) {
  allCards.value = [...allCards.value, card]
  itemColumnMap.value = { ...itemColumnMap.value, [card.id]: columnId }
  selectedCard.value = card
  sidebarOpen.value = true
}

const columnsRef = ref<HTMLElement | null>(null)

function onColumnsWheel(e: WheelEvent) {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  let el = e.target as HTMLElement | null
  while (el && el !== e.currentTarget) {
    if (el.scrollHeight > el.clientHeight) {
      const atTop = el.scrollTop === 0 && e.deltaY < 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0
      if (!atTop && !atBottom) return
    }
    el = el.parentElement
  }
  e.preventDefault()
  columnsRef.value?.scrollBy({ left: e.deltaY })
}
</script>

<template>
  <UDashboardGroup>
    <!-- Sidebar -->
    <UDashboardSidebar
      id="board-filters"
      collapsible
      resizable
      :min-size="12"
      :default-size="15"
      :max-size="22"
      class="bg-elevated/25"
    >
      <template #header>
        <div class="flex items-center gap-2 w-full px-3 py-3">
          <UPopover :ui="{ content: 'w-[260px] p-0' }">
            <button class="flex items-center gap-2 min-w-0 flex-1 text-left group">
              <UIcon name="i-lucide-kanban" class="size-4 text-primary shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-highlighted truncate group-hover:text-primary transition-colors">{{ projectTitle || org }}</div>
                <div class="text-[11px] text-dimmed truncate">{{ org }}</div>
              </div>
              <UIcon name="i-lucide-chevrons-up-down" class="size-3.5 text-dimmed shrink-0" />
            </button>

            <template #content>
              <div class="flex flex-col">
                <div v-if="siblingProjects.length > 0" class="max-h-[240px] overflow-y-auto p-1">
                  <NuxtLink
                    v-for="p in siblingProjects"
                    :key="p.number"
                    :to="`${ownerPath(ownerType.value, org)}/${p.number}`"
                    class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm no-underline transition-colors"
                    :class="p.number === projectNumber ? 'bg-primary/10 text-primary' : 'text-highlighted hover:bg-elevated/50'"
                  >
                    <UIcon name="i-lucide-kanban" class="size-4 shrink-0" />
                    <span class="flex-1 truncate">{{ p.title }}</span>
                    <UIcon v-if="p.number === projectNumber" name="i-lucide-check" class="size-3.5 shrink-0" />
                  </NuxtLink>
                </div>
                <div class="border-t border-default p-1">
                  <NuxtLink
                    :to="ownerPath(ownerType.value, org)"
                    class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted no-underline hover:bg-elevated/50 transition-colors"
                  >
                    <UIcon name="i-lucide-arrow-left" class="size-4" />
                    All projects
                  </NuxtLink>
                  <NuxtLink
                    to="/orgs"
                    class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-muted no-underline hover:bg-elevated/50 transition-colors"
                  >
                    <UIcon name="i-lucide-building-2" class="size-4" />
                    Switch organization
                  </NuxtLink>
                </div>
              </div>
            </template>
          </UPopover>

          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="soft"
            size="xs"
            class="shrink-0"
            @click="showCreateIssue = true"
          />
          <ThemeSettings />
        </div>
      </template>

      <template #default="{ collapsed }">
        <nav class="flex flex-col gap-1 px-2 py-2 overflow-y-auto">
          <!-- Search button -->
          <UDashboardSearchButton :collapsed="collapsed" class="mb-1 bg-transparent ring-default" />

          <!-- Sort -->
          <div v-if="!collapsed" class="flex gap-1 mb-2">
            <USelect
              v-model="sortMode"
              :items="SORT_OPTIONS"
              icon="i-lucide-arrow-up-down"
              size="xs"
              class="flex-1"
            />
            <UButton
              v-if="sortMode !== 'default' || Object.keys(columnSorts).length > 0"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :title="Object.keys(columnSorts).length > 0 ? `${modKey}+click to reset all` : 'Reset global sort'"
              @click="(e: MouseEvent) => (e.metaKey || e.ctrlKey) ? resetSort() : (sortMode = 'default')"
            />
          </div>

          <!-- Active filters -->
          <div v-if="!collapsed && activeFilterChips.length > 0" class="mx-1 mb-2 rounded-lg bg-elevated/50 border border-default overflow-hidden">
            <div class="flex items-center justify-between px-2.5 py-1.5 border-b border-default">
              <span class="text-[11px] font-medium text-muted">
                Showing {{ filteredCards.length }} of {{ allCards.length }}
              </span>
              <button
                class="text-[11px] text-dimmed hover:text-primary transition-colors"
                @click="clearFilter"
              >
                Reset
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5 p-2">
              <div
                v-for="(chip, i) in activeFilterChips"
                :key="i"
                class="flex items-center gap-1.5 pl-1 pr-0.5 py-0.5 rounded-full text-xs transition-colors"
                :class="chip.type === 'exclude'
                  ? 'bg-error/10 text-error border border-error/20'
                  : 'bg-primary/10 text-primary border border-primary/20'"
              >
                <UAvatar v-if="chip.avatar" :src="chip.avatar" :alt="chip.label" size="3xs" />
                <UIcon v-else :name="chip.icon" class="size-3.5 ml-0.5" />
                <span v-if="chip.type === 'exclude'" class="text-[11px] font-medium uppercase text-error/60 -mr-0.5">not</span>
                <span class="text-[11px]">{{ chip.label }}</span>
                <button
                  class="rounded-full p-0.5 hover:bg-default/50 transition-colors"
                  @click="chip.remove()"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </div>
            </div>
          </div>

          <!-- Quick filters -->
          <span v-if="!collapsed" class="text-[11px] font-semibold uppercase tracking-wider text-dimmed px-2 pt-2 pb-1">
            Filter
          </span>

          <button
            class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors"
            :class="!hasAnyFilter
              ? 'bg-elevated/50 text-highlighted'
              : 'text-default hover:bg-elevated/50'"
            @click="clearFilter"
          >
            <UIcon name="i-lucide-layout-grid" class="size-4 shrink-0" />
            <template v-if="!collapsed">
              <span class="flex-1 text-left">All Items</span>
              <UBadge size="xs" variant="subtle" color="neutral">
                {{ allCards.length }}
              </UBadge>
            </template>
          </button>

          <button
            v-if="viewerLogin"
            class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors"
            :class="userState(viewerLogin) === 'include'
              ? 'bg-primary/10 text-primary'
              : userState(viewerLogin) === 'exclude'
                ? 'bg-error/10 text-error'
                : 'text-default hover:bg-elevated/50'"
            @click="handleUserClick(viewerLogin!, $event)"
          >
            <UAvatar v-if="viewerAvatar" :src="viewerAvatar" :alt="viewerLogin" size="3xs" />
            <UIcon v-else name="i-lucide-user" class="size-4 shrink-0" />
            <template v-if="!collapsed">
              <span class="flex-1 text-left">My Items</span>
              <UBadge size="xs" variant="subtle" :color="userState(viewerLogin) === 'include' ? 'primary' : userState(viewerLogin) === 'exclude' ? 'error' : 'neutral'">
                {{ myItemsCount }}
              </UBadge>
            </template>
          </button>

          <button
            class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors"
            :class="filterUnassigned
              ? 'bg-primary/10 text-primary'
              : 'text-default hover:bg-elevated/50'"
            @click="toggleUnassigned"
          >
            <UIcon name="i-lucide-user-x" class="size-4 shrink-0" />
            <template v-if="!collapsed">
              <span class="flex-1 text-left">Unassigned</span>
              <UBadge size="xs" variant="subtle" :color="filterUnassigned ? 'primary' : 'neutral'">
                {{ unassignedCount }}
              </UBadge>
            </template>
          </button>

          <!-- Team skeleton -->
          <template v-if="loading && boardAssignees.length === 0 && !collapsed">
            <USeparator class="my-2" />
            <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed px-2 pt-1 pb-1">Team</span>
            <div v-for="i in 4" :key="i" class="flex items-center gap-2.5 px-2.5 py-1.5">
              <USkeleton class="size-4 rounded-full" />
              <USkeleton class="h-3 flex-1 rounded" />
            </div>
          </template>

          <!-- Team members section -->
          <template v-if="boardAssignees.length > 0">
            <USeparator v-if="!collapsed" class="my-2" />
            <span v-if="!collapsed" class="text-[11px] font-semibold uppercase tracking-wider text-dimmed px-2 pt-1 pb-1">
              Team
            </span>

            <UInput
              v-if="!collapsed && boardAssignees.length > 5"
              v-model="teamSearch"
              placeholder="Search…"
              icon="i-lucide-search"
              size="xs"
              class="w-full mb-1 mx-0.5"
            />

            <button
              v-for="user in filteredTeam"
              :key="user.login"
              class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors"
              :class="userState(user.login) === 'include'
                ? 'bg-primary/10 text-primary'
                : userState(user.login) === 'exclude'
                  ? 'bg-error/10 text-error line-through'
                  : 'text-default hover:bg-elevated/50'"
              :title="filterHint"
              @click="handleUserClick(user.login, $event)"
            >
              <UAvatar :src="user.avatarUrl" :alt="user.login" size="3xs" />
              <template v-if="!collapsed">
                <span class="flex-1 text-left truncate">{{ user.login }}</span>
                <UBadge size="xs" variant="subtle" :color="userState(user.login) === 'include' ? 'primary' : userState(user.login) === 'exclude' ? 'error' : 'neutral'">
                  {{ user.count }}
                </UBadge>
              </template>
            </button>

            <button
              v-if="!collapsed && hasMoreTeam"
              class="flex items-center gap-2 w-full px-2.5 py-1 rounded-md text-xs text-dimmed hover:text-muted transition-colors"
              @click="showAllTeam = !showAllTeam"
            >
              <UIcon :name="showAllTeam ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5" />
              {{ showAllTeam ? 'Show less' : `Show all ${searchedTeam.length}` }}
            </button>
          </template>

          <!-- Repos skeleton -->
          <template v-if="loading && boardRepos.length <= 1 && !collapsed">
            <USeparator class="my-2" />
            <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed px-2 pt-1 pb-1">Repos</span>
            <div v-for="i in 3" :key="i" class="flex items-center gap-2.5 px-2.5 py-1.5">
              <USkeleton class="size-4 rounded" />
              <USkeleton class="h-3 flex-1 rounded" />
            </div>
          </template>

          <!-- Repos section -->
          <template v-if="boardRepos.length > 1">
            <USeparator v-if="!collapsed" class="my-2" />
            <span v-if="!collapsed" class="text-[11px] font-semibold uppercase tracking-wider text-dimmed px-2 pt-1 pb-1">
              Repos
            </span>

            <UInput
              v-if="!collapsed && boardRepos.length > 5"
              v-model="repoSearch"
              placeholder="Search…"
              icon="i-lucide-search"
              size="xs"
              class="w-full mb-1 mx-0.5"
            />

            <button
              v-for="repo in filteredRepos"
              :key="repo.name"
              class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors"
              :class="repoState(repo.name) === 'include'
                ? 'bg-primary/10 text-primary'
                : repoState(repo.name) === 'exclude'
                  ? 'bg-error/10 text-error line-through'
                  : 'text-default hover:bg-elevated/50'"
              @click="handleRepoClick(repo.name, $event)"
            >
              <UIcon name="i-lucide-git-fork" class="size-4 shrink-0" />
              <template v-if="!collapsed">
                <span class="flex-1 text-left truncate">{{ repo.name }}</span>
                <UBadge size="xs" variant="subtle" :color="repoState(repo.name) === 'include' ? 'primary' : repoState(repo.name) === 'exclude' ? 'error' : 'neutral'">
                  {{ repo.count }}
                </UBadge>
              </template>
            </button>

            <button
              v-if="!collapsed && hasMoreRepos"
              class="flex items-center gap-2 w-full px-2.5 py-1 rounded-md text-xs text-dimmed hover:text-muted transition-colors"
              @click="showAllRepos = !showAllRepos"
            >
              <UIcon :name="showAllRepos ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5" />
              {{ showAllRepos ? 'Show less' : `Show all ${searchedRepos.length}` }}
            </button>
          </template>
        </nav>
      </template>

      <template #footer>
        <div class="w-full px-3 py-3 flex items-center justify-between">
          <NuxtLink to="/orgs">
            <RezeLogo class="h-4 text-primary" />
          </NuxtLink>
          <div class="flex items-center gap-1.5 text-[10px] text-dimmed">
            <span>v{{ appVersion }}</span>
            <UButton icon="i-lucide-circle-help" size="2xs" variant="ghost" color="neutral" @click="showShortcuts = true" />
            <a href="https://github.com/flycro/reze" target="_blank" rel="noopener noreferrer" class="hover:text-muted transition-colors">
              <UIcon name="i-lucide-github" class="size-3.5" />
            </a>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <!-- Command palette search -->
    <UDashboardSearch
      v-model:search-term="searchTerm"
      placeholder="Search… ( @ team  / repos  # number  > actions )"
      :groups="searchGroups"
      :fuse="{ resultLimit: 12 }"
    />

    <!-- Main Board Panel -->
    <UDashboardPanel id="board-main">

      <!-- Loading -->
      <template v-if="loading" #body>
        <div class="flex-1 flex flex-col items-center justify-center gap-4">
          <div class="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <div class="flex flex-col items-center gap-2 w-48">
            <UProgress
              :model-value="isFetchingMore && totalCount > 0 ? Math.round((allCards.length / totalCount) * 100) : undefined"
              :animation="!isFetchingMore ? 'carousel' : undefined"
              size="xs"
              class="w-full"
            />
            <span class="text-xs text-dimmed">
              {{ isFetchingMore ? `${allCards.length} of ${totalCount} items` : 'Loading board…' }}
            </span>
          </div>
        </div>
      </template>

      <!-- Board -->
      <template v-else #default>
        <div class="flex flex-1 min-h-0 overflow-hidden">
          <div v-if="filteredCards.length === 0 && hasAnyFilter" class="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <UIcon name="i-lucide-filter-x" class="size-10 text-dimmed" />
            <p class="text-sm text-muted">No items match your filters</p>
            <UButton size="xs" variant="soft" color="primary" icon="i-lucide-x" @click="clearFilter">
              Clear filters
            </UButton>
          </div>
          <div
            v-else
            ref="columnsRef"
            class="flex gap-3 px-3 sm:px-6 py-3 sm:py-5 overflow-x-auto overflow-y-hidden flex-1 min-h-0 items-start max-sm:snap-x max-sm:snap-mandatory"
            @wheel="onColumnsWheel"
          >
            <KanbanColumn
              v-if="noStatusCards.length > 0"
              id="__no_status__"
              title="No Status"
              color="GRAY"
              :cards="noStatusCards"
              :droppable="false"
              :selected-card-id="selectedCard?.id"
              :sort-mode="getColumnSort('__no_status__')"
              :has-custom-sort="'__no_status__' in columnSorts"
              :sort-options="SORT_OPTIONS"
              @select="handleSelect"
              @drop="handleDrop"
              @sort="setColumnSort"
            />
            <KanbanColumn
              v-for="col in columns"
              :id="col.id"
              :key="col.id"
              :title="col.name"
              :color="col.color"
              :cards="cardsForColumn(col.id)"
              :selected-card-id="selectedCard?.id"
              :sort-mode="getColumnSort(col.id)"
              :has-custom-sort="col.id in columnSorts"
              :sort-options="SORT_OPTIONS"
              @select="handleSelect"
              @drop="handleDrop"
              @sort="setColumnSort"
            />
          </div>

          <CardSidebar
            v-if="selectedCard"
            :card="selectedCard"
            :columns="columns"
            :current-column-id="currentColumnId"
            :org="org"
            :assignee-counts="assigneeCounts"
            :all-cards="allCards"
            @close="closeSidebar"
            @move="handleMove"
            @assignees-changed="handleAssigneesChanged"
          />
        </div>
      </template>
    </UDashboardPanel>

    <!-- Create Issue Modal -->
    <CreateIssueModal
      v-model:open="showCreateIssue"
      :org="org"
      :project-id="projectId"
      :status-field-id="statusFieldId"
      :columns="columns"
      :board-repos="boardRepos"
      :active-repo-filter="filterRepos"
      @created="handleIssueCreated"
    />

    <!-- Keyboard shortcuts help -->
    <UModal v-model:open="showShortcuts" title="Keyboard Shortcuts">
      <template #body>
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Create issue</span>
            <UKbd>C</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Command palette</span>
            <div class="flex gap-0.5"><UKbd>{{ modKey }}</UKbd><UKbd>K</UKbd></div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">My items filter</span>
            <UKbd>F</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Clear filters</span>
            <UKbd>X</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Refresh board</span>
            <UKbd>R</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Close / back</span>
            <UKbd>Esc</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Next card</span>
            <div class="flex gap-0.5"><UKbd>J</UKbd><span class="text-dimmed">/</span><UKbd>↓</UKbd></div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Previous card</span>
            <div class="flex gap-0.5"><UKbd>K</UKbd><span class="text-dimmed">/</span><UKbd>↑</UKbd></div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Next column</span>
            <UKbd>→</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Previous column</span>
            <UKbd>←</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Move card</span>
            <div class="flex gap-0.5"><UKbd>{{ modKey }}</UKbd><UKbd>M</UKbd></div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Open assignees</span>
            <UKbd>A</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Assign to me</span>
            <div class="flex gap-0.5"><UKbd>{{ modKey }}</UKbd><UKbd>A</UKbd></div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Write comment</span>
            <UKbd>E</UKbd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-muted">Move to In Progress</span>
            <div class="flex gap-0.5"><UKbd>{{ modKey }}</UKbd><UKbd>P</UKbd></div>
          </div>
        </div>
      </template>
    </UModal>
  </UDashboardGroup>
</template>
