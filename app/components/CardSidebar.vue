<script setup lang="ts">
import type { CardData, ColumnOption, OrgMember } from '~/utils/types'
import { ADD_COMMENT_MUTATION, ADD_ASSIGNEE_MUTATION, REMOVE_ASSIGNEE_MUTATION, CLOSE_ISSUE_MUTATION, CLOSE_PR_MUTATION, REOPEN_ISSUE_MUTATION, REOPEN_PR_MUTATION } from '~/utils/queries'

const props = defineProps<{
  card: CardData
  columns: ColumnOption[]
  currentColumnId: string | null
  org: string
  assigneeCounts: Map<string, number>
  allCards: CardData[]
}>()

const emit = defineEmits<{
  close: []
  move: [itemId: string, toColumnId: string]
  assigneesChanged: [cardId: string, assignees: CardData['assignees']]
}>()

const { graphqlMutation, rest, restCached } = useGitHub()

const sidebarEl = ref<HTMLElement | null>(null)
const LG_BREAKPOINT = 1024
const isDesktop = ref(true)

onMounted(() => {
  const mq = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
  isDesktop.value = mq.matches
  mq.addEventListener('change', (e) => { isDesktop.value = e.matches })
})

const STORAGE_KEY = 'sidebar_width_fraction'
const DEFAULT_FRACTION = 0.3
const MIN_WIDTH = 240
const MAX_FRACTION = 0.65

const width = ref(0)
const widthRef = ref(0)

onMounted(() => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const fraction = stored ? parseFloat(stored) : DEFAULT_FRACTION
  width.value = Math.round(window.innerWidth * fraction)
  widthRef.value = width.value
})

watch(width, (v) => { widthRef.value = v })

function startResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = widthRef.value

  const onMove = (e: MouseEvent) => {
    const newWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth * MAX_FRACTION, startWidth + startX - e.clientX))
    width.value = Math.round(newWidth)
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem(STORAGE_KEY, String(widthRef.value / window.innerWidth))
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

interface RawTimelineEvent {
  id?: number
  event: string
  actor?: { login: string; avatar_url: string }
  created_at: string
  body_html?: string
  body?: string
  html_url?: string
  assignee?: { login: string; avatar_url: string }
  label?: { name: string; color: string }
  project_card?: { column_name: string; previous_column_name?: string; project_name?: string }
  rename?: { from: string; to: string }
  source?: { type: string; issue?: { number: number; title: string; html_url: string; pull_request?: object } }
}

type CrossRef = { number: number; title: string; html_url: string; isPR: boolean }
type DisplayEvent =
  | (RawTimelineEvent & { _type: 'single' })
  | { _type: 'labels'; actor?: { login: string; avatar_url: string }; created_at: string; added: Array<{ name: string; color: string }>; removed: Array<{ name: string; color: string }> }
  | { _type: 'cross-refs'; actor?: { login: string; avatar_url: string }; created_at: string; refs: CrossRef[] }

const RELEVANT_EVENTS = new Set([
  'commented', 'assigned', 'unassigned', 'labeled', 'unlabeled',
  'moved_columns_in_project', 'added_to_project', 'closed', 'reopened', 'renamed',
  'cross-referenced',
])

function processTimelineEvents(events: RawTimelineEvent[]): DisplayEvent[] {
  const deduped = events.filter((event, i) => {
    if (event.event !== 'moved_columns_in_project') return true
    const next = events[i + 1]
    return !next || next.event !== 'moved_columns_in_project'
  })

  const result: DisplayEvent[] = []
  let i = 0
  while (i < deduped.length) {
    const event = deduped[i]

    if (event.event === 'cross-referenced' && event.source?.issue) {
      const actorLogin = event.actor?.login
      const refs: CrossRef[] = []
      while (i < deduped.length && deduped[i].event === 'cross-referenced' && deduped[i].actor?.login === actorLogin) {
        const e = deduped[i]
        if (e.source?.issue) {
          refs.push({ number: e.source.issue.number, title: e.source.issue.title, html_url: e.source.issue.html_url, isPR: !!e.source.issue.pull_request })
        }
        i++
      }
      result.push({ _type: 'cross-refs', actor: event.actor, created_at: event.created_at, refs })
      continue
    }

    if (event.event !== 'labeled' && event.event !== 'unlabeled') {
      result.push({ ...event, _type: 'single' })
      i++
      continue
    }

    const actorLogin = event.actor?.login
    const added: Array<{ name: string; color: string }> = []
    const removed: Array<{ name: string; color: string }> = []
    let lastCreatedAt = event.created_at
    while (i < deduped.length && (deduped[i].event === 'labeled' || deduped[i].event === 'unlabeled') && deduped[i].actor?.login === actorLogin) {
      const e = deduped[i]
      if (e.label) {
        if (e.event === 'labeled') added.push(e.label)
        else removed.push(e.label)
      }
      lastCreatedAt = e.created_at
      i++
    }
    result.push({ _type: 'labels', actor: event.actor, created_at: lastCreatedAt, added, removed })
  }
  return result
}

const commentBody = ref('')
const commentError = ref<string | null>(null)
const isCommentInFlight = ref(false)
const optimisticComment = ref<string | null>(null)
const localAssignees = ref<CardData['assignees']>([])
const showPopover = ref(false)
const memberSearch = ref('')
const orgMembers = ref<OrgMember[]>([])
const isFetchingMembers = ref(false)
const bodyScrolled = ref(false)
const timelineEvents = ref<DisplayEvent[]>([])
const timelineLoading = ref(false)
const isClosing = ref(false)
interface MentionResult {
  label: string
  sublabel?: string
  icon: string
  iconClass?: string
  avatar?: string
  insertText: string
}

const mentionResults = ref<MentionResult[]>([])
const mentionIndex = ref(0)

const textareaRef = ref<any>(null)

function getTextarea(): HTMLTextAreaElement | null {
  const el = textareaRef.value
  if (!el) return null
  if (el instanceof HTMLTextAreaElement) return el
  return el.$el?.querySelector?.('textarea') ?? null
}
const bodyRef = ref<HTMLDivElement | null>(null)

const cardRepoInfo = computed(() => props.card.url ? parseRepoFromUrl(props.card.url) : null)

const router = useRouter()
const route = useRoute()

function onRepoClick(e: MouseEvent) {
  if ((e.metaKey || e.ctrlKey) && cardRepoInfo.value) {
    e.preventDefault()
    e.stopPropagation()
    const repo = cardRepoInfo.value.repo
    const current = route.query.filter === 'repo' && route.query.repo === repo
    router.replace({
      query: current ? {} : { filter: 'repo', repo }
    })
  }
}

const canClose = computed(() =>
  props.card.contentId && (props.card.typename === 'Issue' || props.card.typename === 'PullRequest') && props.card.state === 'OPEN'
)

const canReopen = computed(() =>
  props.card.contentId && (props.card.typename === 'Issue' || props.card.typename === 'PullRequest') && props.card.state === 'CLOSED'
)

const isReopening = ref(false)

const moveToValue = computed({
  get: () => props.currentColumnId ?? '',
  set: (val: string) => emit('move', props.card.id, val)
})

const selectItems = computed(() =>
  props.columns.map(col => ({ label: col.name, value: col.id }))
)

const filteredMembers = computed(() => {
  const q = memberSearch.value.toLowerCase()
  return orgMembers.value
    .filter(m => !localAssignees.value.some(a => a.login === m.login))
    .filter(m => !q || m.login.toLowerCase().includes(q))
    .sort((a, b) => {
      const ca = props.assigneeCounts.get(a.login) ?? 0
      const cb = props.assigneeCounts.get(b.login) ?? 0
      if (cb !== ca) return cb - ca
      return a.login.localeCompare(b.login)
    })
})

let timelineAbort: AbortController | null = null

async function loadTimeline() {
  timelineAbort?.abort()
  timelineAbort = new AbortController()
  const signal = timelineAbort.signal

  if (!props.card.url) { timelineEvents.value = []; return }
  const repoInfo = parseRepoFromUrl(props.card.url)
  if (!repoInfo) { timelineEvents.value = []; return }

  timelineLoading.value = true
  timelineEvents.value = []

  try {
    const data = await rest<RawTimelineEvent[]>(
      `repos/${repoInfo.owner}/${repoInfo.repo}/issues/${repoInfo.number}/timeline?per_page=100`,
      { signal }
    )
    if (signal.aborted) return
    if (Array.isArray(data)) {
      const filtered = data.filter(e => RELEVANT_EVENTS.has(e.event))
      timelineEvents.value = processTimelineEvents(filtered)
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return
    // Silently fail — timeline is non-critical
    console.warn('Failed to load timeline:', e.message)
  } finally {
    if (!signal.aborted) timelineLoading.value = false
  }
}

onUnmounted(() => {
  timelineAbort?.abort()
})

watch(() => props.card, () => {
  localAssignees.value = [...props.card.assignees]
  commentBody.value = ''
  commentError.value = null
  optimisticComment.value = null
  mentionResults.value = []
  loadTimeline()
}, { immediate: true })

async function loadMembers() {
  if (orgMembers.value.length > 0 || isFetchingMembers.value) return
  isFetchingMembers.value = true
  try {
    const data = await restCached<Array<{ login: string; avatar_url: string; node_id: string }>>(
      `orgs/${props.org}/members?per_page=100`
    )
    orgMembers.value = Array.isArray(data)
      ? data.map(m => ({ login: m.login, avatarUrl: m.avatar_url, nodeId: m.node_id }))
      : []
  } finally {
    isFetchingMembers.value = false
  }
}

async function openPopover() {
  showPopover.value = true
  await loadMembers()
}

async function addAssignee(member: OrgMember) {
  if (!props.card.contentId) return
  showPopover.value = false
  memberSearch.value = ''
  localAssignees.value = [...localAssignees.value, { login: member.login, avatarUrl: member.avatarUrl }]
  emit('assigneesChanged', props.card.id, localAssignees.value)
  try {
    await graphqlMutation(ADD_ASSIGNEE_MUTATION, {
      assignableId: props.card.contentId,
      assigneeIds: [member.nodeId],
    })
  } catch {
    localAssignees.value = localAssignees.value.filter(a => a.login !== member.login)
    emit('assigneesChanged', props.card.id, localAssignees.value)
    commentError.value = 'Failed to add assignee — check your token has write access.'
  }
}

async function removeAssignee(login: string) {
  if (!props.card.contentId) return
  const member = orgMembers.value.find(m => m.login === login)
  const removed = localAssignees.value.find(a => a.login === login)
  localAssignees.value = localAssignees.value.filter(a => a.login !== login)
  emit('assigneesChanged', props.card.id, localAssignees.value)
  try {
    const nodeId = member?.nodeId
    if (!nodeId) {
      if (orgMembers.value.length === 0) await loadMembers()
      const found = orgMembers.value.find(m => m.login === login)
      if (!found) throw new Error('Could not find user node ID')
      await graphqlMutation(REMOVE_ASSIGNEE_MUTATION, {
        assignableId: props.card.contentId,
        assigneeIds: [found.nodeId],
      })
    } else {
      await graphqlMutation(REMOVE_ASSIGNEE_MUTATION, {
        assignableId: props.card.contentId,
        assigneeIds: [nodeId],
      })
    }
  } catch {
    if (removed) localAssignees.value = [...localAssignees.value, removed]
    emit('assigneesChanged', props.card.id, localAssignees.value)
    commentError.value = 'Failed to remove assignee — check your token has write access.'
  }
}

async function doClose() {
  if (!props.card.contentId) return
  isClosing.value = true
  try {
    if (props.card.typename === 'Issue') {
      await graphqlMutation(CLOSE_ISSUE_MUTATION, { id: props.card.contentId })
    } else {
      await graphqlMutation(CLOSE_PR_MUTATION, { id: props.card.contentId })
    }
  } catch {
    commentError.value = 'Failed to close — check your token has write access.'
  } finally {
    isClosing.value = false
  }
}

async function doReopen() {
  if (!props.card.contentId) return
  isReopening.value = true
  try {
    if (props.card.typename === 'Issue') {
      await graphqlMutation(REOPEN_ISSUE_MUTATION, { id: props.card.contentId })
    } else {
      await graphqlMutation(REOPEN_PR_MUTATION, { id: props.card.contentId })
    }
  } catch {
    commentError.value = 'Failed to reopen — check your token has write access.'
  } finally {
    isReopening.value = false
  }
}

async function pollForComment(commentedCountBefore: number) {
  if (!props.card.url) return
  const repoInfo = parseRepoFromUrl(props.card.url)
  if (!repoInfo) return

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const data = await rest<RawTimelineEvent[]>(
        `repos/${repoInfo.owner}/${repoInfo.repo}/issues/${repoInfo.number}/timeline?per_page=100`
      )
      if (!Array.isArray(data)) break
      const filtered = data.filter(e => RELEVANT_EVENTS.has(e.event))
      const commentedCount = filtered.filter(e => e.event === 'commented').length
      if (commentedCount > commentedCountBefore) {
        timelineEvents.value = processTimelineEvents(filtered)
        optimisticComment.value = null
        return
      }
    } catch { break }
  }
  optimisticComment.value = null
}

async function submitComment(andClose = false) {
  if (!props.card.contentId) return
  commentError.value = null
  const body = commentBody.value.trim()

  if (body) {
    const commentedCountBefore = timelineEvents.value.filter(e => e._type === 'single' && (e as any).event === 'commented').length
    optimisticComment.value = body
    commentBody.value = ''
    isCommentInFlight.value = true

    try {
      await graphqlMutation(ADD_COMMENT_MUTATION, { subjectId: props.card.contentId, body })
      if (andClose) {
        await doClose()
      } else {
        pollForComment(commentedCountBefore)
      }
    } catch {
      optimisticComment.value = null
      commentBody.value = body
      commentError.value = 'Failed to post comment — check your token has write access.'
    } finally {
      isCommentInFlight.value = false
    }
  } else if (andClose) {
    await doClose()
  }
}

let skipMentionWatch = false

const mentionType = ref<'issue' | 'user' | null>(null)

watch(commentBody, () => {
  if (skipMentionWatch) { skipMentionWatch = false; return }

  const textarea = getTextarea()
  const cursor = textarea?.selectionStart ?? commentBody.value.length
  const textBefore = commentBody.value.slice(0, cursor)

  if (/\s$/.test(textBefore)) { mentionResults.value = []; mentionType.value = null; return }

  // @user mentions
  const userMatch = textBefore.match(/@([\w-]*)$/)
  if (userMatch) {
    mentionType.value = 'user'
    const q = userMatch[1].toLowerCase()
    mentionIndex.value = 0
    mentionResults.value = orgMembers.value
      .filter(m => !q || m.login.toLowerCase().includes(q))
      .slice(0, 7)
      .map(m => ({
        label: m.login,
        icon: 'i-lucide-user',
        avatar: m.avatarUrl,
        insertText: `@${m.login}`,
      }))
    if (mentionResults.value.length === 0 && !q) {
      loadMembers()
    }
    return
  }

  // #issue references
  const issueMatch = textBefore.match(/(?:([\w.-]+(?:\/[\w.-]+)?))?#([\w\s-]*)$/)
  if (issueMatch && issueMatch[2]) {
    mentionType.value = 'issue'
    const repoPrefix = issueMatch[1]?.toLowerCase() ?? null
    const q = issueMatch[2].trim().toLowerCase()
    mentionIndex.value = 0
    const currentRepo = repoFromUrl(props.card.url)

    mentionResults.value = props.allCards
      .filter(c => c.number !== undefined && c.id !== props.card.id)
      .filter(c => {
        if (repoPrefix) {
          const cardRepo = repoFromUrl(c.url)?.toLowerCase()
          if (!cardRepo?.includes(repoPrefix) && !c.url?.toLowerCase().includes(repoPrefix)) return false
        }
        if (!q) return true
        if (String(c.number).includes(q)) return true
        return c.title.toLowerCase().includes(q)
      })
      .slice(0, 7)
      .map(c => {
        const cardRepo = repoFromUrl(c.url)
        const parsed = c.url ? parseRepoFromUrl(c.url) : null
        const isCrossRepo = cardRepo && currentRepo && cardRepo !== currentRepo
        const fullRef = parsed ? `${parsed.owner}/${parsed.repo}` : cardRepo
        return {
          label: c.title,
          sublabel: cardRepo ? `${cardRepo}#${c.number}` : `#${c.number}`,
          icon: c.typename === 'PullRequest' ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot',
          iconClass: 'text-green-400',
          insertText: isCrossRepo && fullRef ? `${fullRef}#${c.number}` : `#${c.number}`,
        }
      })
    return
  }

  mentionResults.value = []
  mentionType.value = null
})

function insertMention(text: string) {
  const textarea = getTextarea()
  const cursor = textarea?.selectionStart ?? commentBody.value.length
  const before = commentBody.value.slice(0, cursor)
  const after = commentBody.value.slice(cursor)
  const pattern = mentionType.value === 'user'
    ? /@[\w-]*$/
    : /(?:[\w.-]+(?:\/[\w.-]+)?)?#[\w\s-]*$/
  const replaced = before.replace(pattern, `${text} `)
  skipMentionWatch = true
  mentionType.value = null
  commentBody.value = replaced + after
  mentionResults.value = []
  nextTick(() => {
    if (!textarea) return
    textarea.focus()
    textarea.selectionStart = textarea.selectionEnd = replaced.length
  })
}

function onCommentKeyDown(e: KeyboardEvent) {
  if (mentionResults.value.length > 0) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex.value = (mentionIndex.value + 1) % mentionResults.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex.value = (mentionIndex.value - 1 + mentionResults.value.length) % mentionResults.value.length; return }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); insertMention(mentionResults.value[mentionIndex.value].insertText); return }
    if (e.key === 'Escape') { mentionResults.value = []; return }
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment(false)
}

onMounted(() => {
  const el = bodyRef.value
  if (!el) return
  el.addEventListener('scroll', () => {
    bodyScrolled.value = el.scrollTop > 40
  }, { passive: true })
})

onMounted(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})

const modKey = import.meta.client && navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

onMounted(() => {
  const handler = async () => {
    if (!props.card.contentId) return
    if (orgMembers.value.length === 0) await loadMembers()
    const viewerLogin = localStorage.getItem('github_viewer_login')
    if (!viewerLogin) return
    if (localAssignees.value.some(a => a.login === viewerLogin)) return
    const me = orgMembers.value.find(m => m.login === viewerLogin)
    if (me) addAssignee(me)
  }
  const openHandler = () => {
    openPopover()
  }
  window.addEventListener('reze:assign-me', handler as EventListener)
  const focusComment = () => {
    const textarea = getTextarea()
    if (textarea) textarea.focus()
  }
  window.addEventListener('reze:open-assignees', openHandler as EventListener)
  window.addEventListener('reze:focus-comment', focusComment as EventListener)
  onUnmounted(() => {
    window.removeEventListener('reze:assign-me', handler as EventListener)
    window.removeEventListener('reze:open-assignees', openHandler as EventListener)
    window.removeEventListener('reze:focus-comment', focusComment as EventListener)
  })
})

watch(showPopover, (open) => {
  if (!open) memberSearch.value = ''
})
</script>

<template>
  <aside
    ref="sidebarEl"
    class="shrink-0 bg-elevated/25 max-lg:!bg-default border-l border-default flex flex-col overflow-hidden relative max-lg:!fixed max-lg:!inset-0 max-lg:!z-40 max-lg:!w-full max-lg:!border-l-0"
    :style="isDesktop && width ? { width: `${width}px` } : undefined"
  >
    <!-- Resize handle -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/25 active:bg-primary/25 max-lg:hidden"
      @mousedown="startResize"
    />

    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3.5 border-b border-default shrink-0">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <div v-if="card.number !== undefined" class="flex items-center gap-1 text-xs text-dimmed">
          <template v-if="cardRepoInfo">
            <a
              :href="`https://github.com/${cardRepoInfo.owner}/${cardRepoInfo.repo}`"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1 text-muted no-underline hover:underline"
              :title="`${cardRepoInfo.repo} — ⌘/Ctrl+click to filter`"
              @click="onRepoClick"
            >
              <UIcon name="i-lucide-git-fork" class="size-3.5 text-primary" />
              {{ cardRepoInfo.repo }}
            </a>
            <UIcon name="i-lucide-chevron-right" class="size-3 text-dimmed" />
          </template>
          <a
            v-if="card.url"
            :href="card.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1 text-muted no-underline hover:underline"
          >
            <UIcon :name="card.typename === 'PullRequest' ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot'" class="size-3.5" />
            {{ card.typename === 'PullRequest' ? 'PR' : '#' }}{{ card.number }}
          </a>
        </div>
        <UBadge
          v-if="card.state"
          size="xs"
          :color="card.state === 'OPEN' ? 'success' : card.state === 'MERGED' ? 'info' : 'error'"
          variant="subtle"
        >
          {{ card.state }}
        </UBadge>
        <template v-if="bodyScrolled">
          <a
            v-if="card.url"
            :href="card.url"
            target="_blank"
            rel="noreferrer"
            class="text-xs text-highlighted truncate min-w-0 hover:underline"
          >
            {{ card.title }}
          </a>
          <span v-else class="text-xs text-highlighted truncate min-w-0">{{ card.title }}</span>
        </template>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" @click="emit('close')" />
    </div>

    <!-- Body -->
    <div ref="bodyRef" class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
      <!-- Title -->
      <h2 class="text-base font-semibold text-highlighted leading-snug">
        <a v-if="card.url" :href="card.url" target="_blank" rel="noreferrer" class="text-highlighted hover:text-primary no-underline">
          {{ card.title }}
        </a>
        <template v-else>{{ card.title }}</template>
      </h2>

      <!-- Labels + Author -->
      <div v-if="card.labels.length > 0 || card.author" class="flex items-center flex-wrap gap-2">
        <div class="flex flex-wrap gap-1.5 flex-1">
          <span
            v-for="label in card.labels"
            :key="label.name"
            class="text-xs px-2 py-0.5 rounded-full border font-medium"
            :style="{
              background: `#${label.color}22`,
              color: `#${label.color}`,
              borderColor: `#${label.color}44`,
            }"
          >
            {{ label.name }}
          </span>
        </div>
        <div v-if="card.author || card.createdAt" class="flex items-center gap-1.5 shrink-0 text-[13px]">
          <template v-if="card.author">
            <span class="text-xs text-dimmed">by</span>
            <UAvatar :src="card.author.avatarUrl" :alt="card.author.login" size="3xs" />
            <GitHubUser :login="card.author.login" />
          </template>
          <span v-if="card.author && card.createdAt" class="text-dimmed">·</span>
          <span v-if="card.createdAt" class="text-xs text-dimmed">{{ formatRelativeTime(card.createdAt) }}</span>
        </div>
      </div>

      <!-- Assignees -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">Assignees</span>
          <UPopover v-if="card.contentId" v-model:open="showPopover" :ui="{ content: 'w-[240px] p-0' }">
            <UButton
              icon="i-lucide-plus"
              color="primary"
              variant="soft"
              size="2xs"
              @click="openPopover"
            />
            <template #content>
              <div class="flex flex-col">
                <div class="p-2 border-b border-default">
                  <UInput
                    v-model="memberSearch"
                    placeholder="Search members…"
                    icon="i-lucide-search"
                    size="sm"
                    class="w-full"
                    autofocus
                    @keydown.enter="filteredMembers.length > 0 && addAssignee(filteredMembers[0])"
                  />
                </div>
                <div class="max-h-[240px] overflow-y-auto p-1">
                  <div v-if="isFetchingMembers" class="text-dimmed text-xs p-3 text-center">Loading…</div>
                  <div v-else-if="filteredMembers.length === 0" class="text-dimmed text-xs p-3 text-center">No members found</div>
                  <button
                    v-for="m in filteredMembers"
                    :key="m.login"
                    class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[13px] text-left transition-colors text-highlighted hover:bg-elevated/50"
                    @click="addAssignee(m)"
                  >
                    <UAvatar :src="m.avatarUrl" :alt="m.login" size="2xs" />
                    <span class="flex-1 truncate">{{ m.login }}</span>
                    <UBadge v-if="(assigneeCounts.get(m.login) ?? 0) > 0" size="xs" variant="subtle" color="neutral">
                      {{ assigneeCounts.get(m.login) }}
                    </UBadge>
                  </button>
                </div>
              </div>
            </template>
          </UPopover>
        </div>
        <div v-if="localAssignees.length > 0" class="flex flex-wrap gap-2">
          <UBadge
            v-for="a in localAssignees"
            :key="a.login"
            size="sm"
            variant="subtle"
            color="neutral"
            class="gap-1.5 py-1 group"
          >
            <UAvatar :src="a.avatarUrl" :alt="a.login" size="3xs" />
            <GitHubUser :login="a.login" class="text-xs" />
            <button
              v-if="card.contentId"
              class="opacity-0 group-hover:opacity-100 transition-opacity hover:text-error"
              title="Remove assignee"
              @click.stop="removeAssignee(a.login)"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </UBadge>
        </div>
        <span v-else class="text-[13px] text-dimmed">No assignee</span>
      </div>

      <!-- Description -->
      <div v-if="card.bodyHTML" class="flex flex-col gap-2">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">Description</span>
        <div v-external-links class="gh-content" v-html="card.bodyHTML" />
      </div>
      <p v-else class="text-[13px] text-dimmed">No description.</p>

      <!-- Activity / Timeline -->
      <div v-if="timelineLoading || timelineEvents.length > 0 || optimisticComment" class="flex flex-col gap-2">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">Activity</span>
        <span v-if="timelineLoading && timelineEvents.length === 0 && !optimisticComment" class="text-[13px] text-dimmed">Loading…</span>

        <div class="flex flex-col gap-2.5">
          <template v-for="(event, i) in timelineEvents" :key="i">
            <!-- Label changes -->
            <div v-if="event._type === 'labels'" class="flex items-center gap-1.5 text-xs text-muted pr-2.5">
              <UAvatar v-if="event.actor" :src="event.actor.avatar_url" :alt="event.actor.login" size="3xs" />
              <span class="flex-1 min-w-0">
                <GitHubUser v-if="event.actor" :login="event.actor.login" bold />
                <template v-if="event.added.length > 0">
                  added
                  <span
                    v-for="l in event.added"
                    :key="l.name"
                    class="text-[11px] px-1.5 py-px rounded-full border font-medium align-middle mx-0.5"
                    :style="{ background: `#${l.color}22`, color: `#${l.color}`, borderColor: `#${l.color}44` }"
                  >{{ l.name }}</span>
                </template>
                <template v-if="event.added.length > 0 && event.removed.length > 0">, </template>
                <template v-if="event.removed.length > 0">
                  removed
                  <span
                    v-for="l in event.removed"
                    :key="l.name"
                    class="text-[11px] px-1.5 py-px rounded-full border font-medium align-middle mx-0.5"
                    :style="{ background: `#${l.color}22`, color: `#${l.color}`, borderColor: `#${l.color}44` }"
                  >{{ l.name }}</span>
                </template>
              </span>
              <span class="text-[11px] text-dimmed whitespace-nowrap shrink-0">{{ formatRelativeTime(event.created_at) }}</span>
            </div>

            <!-- Cross-refs -->
            <div v-else-if="event._type === 'cross-refs'" class="flex items-start gap-1.5 text-xs text-muted pr-2.5">
              <UAvatar v-if="event.actor" :src="event.actor.avatar_url" :alt="event.actor.login" size="3xs" class="mt-0.5" />
              <span class="flex-1 min-w-0">
                <GitHubUser v-if="event.actor" :login="event.actor.login" bold />
                mentioned this in
                {{ event.refs.filter(r => r.isPR).length > 0 ? `${event.refs.filter(r => r.isPR).length} PR${event.refs.filter(r => r.isPR).length > 1 ? 's' : ''}` : '' }}
                {{ event.refs.filter(r => r.isPR).length > 0 && event.refs.filter(r => !r.isPR).length > 0 ? ' and ' : '' }}
                {{ event.refs.filter(r => !r.isPR).length > 0 ? `${event.refs.filter(r => !r.isPR).length} issue${event.refs.filter(r => !r.isPR).length > 1 ? 's' : ''}` : '' }}
                <div class="flex flex-col gap-0.5 mt-1">
                  <a
                    v-for="r in event.refs"
                    :key="r.html_url"
                    :href="r.html_url"
                    target="_blank"
                    rel="noreferrer"
                    class="flex items-center gap-1 text-primary text-xs no-underline hover:underline truncate"
                  >
                    <UIcon :name="r.isPR ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot'" class="size-3.5 text-muted shrink-0" />
                    {{ r.title }}
                    <span class="text-muted shrink-0">#{{ r.number }}</span>
                  </a>
                </div>
              </span>
              <span class="text-[11px] text-dimmed whitespace-nowrap shrink-0">{{ formatRelativeTime(event.created_at) }}</span>
            </div>

            <!-- Comment -->
            <div v-else-if="(event as any).event === 'commented'" class="bg-default border border-default rounded-md overflow-hidden">
              <div class="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-default">
                <UAvatar v-if="(event as any).actor" :src="(event as any).actor.avatar_url" :alt="(event as any).actor.login" size="3xs" />
                <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold class="text-xs" />
                <span class="flex-1" />
                <span class="text-[11px] text-dimmed whitespace-nowrap shrink-0">{{ formatRelativeTime((event as any).created_at) }}</span>
              </div>
              <div
                v-if="(event as any).body_html"
                v-external-links
                class="gh-content px-2.5 py-2 text-[13px]"
                v-html="(event as any).body_html"
              />
              <p
                v-else-if="(event as any).body"
                class="px-2.5 py-2 text-[13px] text-muted whitespace-pre-wrap"
              >{{ (event as any).body }}</p>
            </div>

            <!-- Other events -->
            <div v-else-if="(event as any).event !== 'commented'" class="flex items-center gap-1.5 text-xs text-muted pr-2.5">
              <UAvatar v-if="(event as any).actor" :src="(event as any).actor.avatar_url" :alt="(event as any).actor.login" size="3xs" />
              <span class="flex-1 min-w-0">
                <template v-if="(event as any).event === 'assigned'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> assigned <GitHubUser v-if="(event as any).assignee" :login="(event as any).assignee.login" bold />
                </template>
                <template v-else-if="(event as any).event === 'unassigned'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> unassigned <GitHubUser v-if="(event as any).assignee" :login="(event as any).assignee.login" bold />
                </template>
                <template v-else-if="(event as any).event === 'moved_columns_in_project'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> moved from <em class="text-toned not-italic">{{ (event as any).project_card?.previous_column_name ?? '?' }}</em> to <em class="text-toned not-italic">{{ (event as any).project_card?.column_name }}</em>
                </template>
                <template v-else-if="(event as any).event === 'added_to_project'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> added to <em class="text-toned not-italic">{{ (event as any).project_card?.column_name }}</em>
                </template>
                <template v-else-if="(event as any).event === 'closed'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> closed this
                </template>
                <template v-else-if="(event as any).event === 'reopened'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> reopened this
                </template>
                <template v-else-if="(event as any).event === 'renamed'">
                  <GitHubUser v-if="(event as any).actor" :login="(event as any).actor.login" bold /> renamed from <em class="text-toned not-italic">{{ (event as any).rename?.from }}</em> to <em class="text-toned not-italic">{{ (event as any).rename?.to }}</em>
                </template>
              </span>
              <span class="text-[11px] text-dimmed whitespace-nowrap shrink-0">{{ formatRelativeTime((event as any).created_at) }}</span>
            </div>
          </template>

          <!-- Optimistic comment -->
          <div v-if="optimisticComment" class="bg-default border border-default rounded-md overflow-hidden opacity-60">
            <div class="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-default">
              <span class="text-xs text-highlighted font-medium flex-1">you</span>
              <span class="text-[11px] text-dimmed">just now</span>
            </div>
            <div class="px-2.5 py-2 text-[13px] text-muted whitespace-pre-wrap">{{ optimisticComment }}</div>
          </div>
        </div>
      </div>

      <!-- Comment input -->
      <div v-if="card.contentId" class="flex flex-col gap-2">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">Leave a comment</span>
        <div class="relative">
          <UTextarea
            ref="textareaRef"
            v-model="commentBody"
            class="w-full"
            :placeholder="`Write a comment… (${modKey}+↵ to submit)`"
            :disabled="isCommentInFlight"
            :rows="4"
            autoresize
            @keydown="onCommentKeyDown"
          />
          <!-- Mention dropdown -->
          <div
            v-if="mentionResults.length > 0"
            class="absolute bottom-full left-0 right-0 mb-1 bg-elevated border border-default rounded-lg overflow-hidden z-50 shadow-xl"
          >
            <div class="px-2.5 py-1.5 border-b border-default">
              <span class="text-[10px] font-semibold text-dimmed uppercase tracking-wider">
                {{ mentionType === 'user' ? 'Mentions' : 'References' }}
              </span>
            </div>
            <div class="p-1">
              <button
                v-for="(item, mi) in mentionResults"
                :key="item.insertText"
                class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-left transition-colors"
                :class="mi === mentionIndex ? 'bg-primary/10 text-primary' : 'text-highlighted hover:bg-elevated/50'"
                @mousedown.prevent="insertMention(item.insertText)"
              >
                <UAvatar v-if="item.avatar" :src="item.avatar" :alt="item.label" size="3xs" />
                <UIcon
                  v-else
                  :name="item.icon"
                  class="size-4 shrink-0"
                  :class="mi === mentionIndex ? 'text-primary' : (item.iconClass ?? 'text-muted')"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm truncate">{{ item.label }}</div>
                  <span v-if="item.sublabel" class="text-[11px] text-dimmed">{{ item.sublabel }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
        <p v-if="commentError" class="text-xs text-error">{{ commentError }}</p>

        <div class="flex gap-2 justify-end">
          <UButton
            v-if="canClose"
            color="error"
            variant="outline"
            :disabled="!commentBody.trim() || isCommentInFlight || isClosing"
            @click="submitComment(true)"
          >
            {{ isClosing ? 'Closing…' : 'Comment & close' }}
          </UButton>
          <UButton
            v-if="canReopen"
            color="success"
            variant="outline"
            :disabled="isCommentInFlight || isReopening"
            @click="doReopen"
          >
            {{ isReopening ? 'Reopening…' : 'Reopen' }}
          </UButton>
          <UButton
            color="primary"
            :disabled="!commentBody.trim() || isCommentInFlight || isClosing"
            @click="submitComment(false)"
          >
            {{ isCommentInFlight ? 'Posting…' : 'Comment' }}
          </UButton>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="shrink-0 flex items-center gap-2.5 px-4 py-3 border-t border-default bg-elevated/50">
      <label class="text-xs text-muted whitespace-nowrap" for="move-to">Move to</label>
      <USelect
        id="move-to"
        v-model="moveToValue"
        :items="selectItems"
        class="flex-1"
        size="sm"
      />
    </div>
  </aside>
</template>
