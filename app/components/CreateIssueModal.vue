<script setup lang="ts">
import { CREATE_ISSUE_MUTATION, ADD_PROJECT_ITEM_MUTATION, MOVE_CARD_MUTATION, ORG_REPOS_QUERY } from '~/utils/queries'
import type { CardData, ColumnOption } from '~/utils/types'
import { adaptQuery, getOwner } from '~/utils/owner'

const props = defineProps<{
  org: string
  projectId: string
  statusFieldId: string
  columns: ColumnOption[]
  boardRepos: Array<{ name: string; count: number }>
  activeRepoFilter?: string[]
}>()

const emit = defineEmits<{
  created: [card: CardData, columnId: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const { graphqlMutation } = useGitHub()

const title = ref('')
const body = ref('')
const selectedRepoId = ref<string | null>(null)
const selectedColumnId = ref<string | null>(null)
const submitting = ref(false)
const error = ref<string | null>(null)

interface Repo {
  id: string
  name: string
  nameWithOwner: string
}

const repos = ref<Repo[]>([])
const loadingRepos = ref(false)

watch(open, async (isOpen) => {
  if (isOpen && repos.value.length === 0) {
    await loadRepos()
  }
  if (isOpen) {
    title.value = ''
    body.value = ''
    error.value = null
    selectedColumnId.value = props.columns[0]?.id ?? null
    selectedRepoId.value = null
    if (props.activeRepoFilter?.length === 1 && repos.value.length > 0) {
      const match = repos.value.find(r => r.name === props.activeRepoFilter![0])
      if (match) selectedRepoId.value = match.id
    } else if (props.boardRepos.length > 0 && repos.value.length > 0) {
      const topRepo = repos.value.find(r => r.name === props.boardRepos[0]?.name)
      if (topRepo) selectedRepoId.value = topRepo.id
    }
  }
})

async function loadRepos() {
  loadingRepos.value = true
  try {
    const { ownerType } = useOwner()
    const data = await graphqlMutation<any>(adaptQuery(ORG_REPOS_QUERY, ownerType.value), { org: props.org })
    const nodes = getOwner(data, ownerType.value)?.repositories?.nodes ?? []
    repos.value = nodes
      .filter((r: any) => r && !r.isArchived)
      .map((r: any) => ({ id: r.id, name: r.name, nameWithOwner: r.nameWithOwner }))

    if (!selectedRepoId.value) {
      if (props.activeRepoFilter?.length === 1) {
        const match = repos.value.find(r => r.name === props.activeRepoFilter![0])
        if (match) selectedRepoId.value = match.id
      } else if (props.boardRepos.length > 0) {
        const topRepo = repos.value.find(r => r.name === props.boardRepos[0]?.name)
        if (topRepo) selectedRepoId.value = topRepo.id
      }
    }
  } catch (e: any) {
    error.value = `Failed to load repos: ${e.message}`
  } finally {
    loadingRepos.value = false
  }
}

const repoItems = computed(() =>
  repos.value.map(r => ({
    label: r.name,
    value: r.id,
  }))
)

const columnItems = computed(() =>
  props.columns.map(c => ({
    label: c.name,
    value: c.id,
  }))
)

const canSubmit = computed(() =>
  title.value.trim() && selectedRepoId.value && selectedColumnId.value && !submitting.value
)

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null

  try {
    const issueData = await graphqlMutation<any>(CREATE_ISSUE_MUTATION, {
      repositoryId: selectedRepoId.value,
      title: title.value.trim(),
      body: body.value.trim() || null,
    })

    const issue = issueData.createIssue?.issue
    if (!issue) throw new Error('Failed to create issue')

    const addData = await graphqlMutation<any>(ADD_PROJECT_ITEM_MUTATION, {
      projectId: props.projectId,
      contentId: issue.id,
    })

    const projectItemId = addData.addProjectV2ItemById?.item?.id
    if (!projectItemId) throw new Error('Failed to add issue to project')

    await graphqlMutation(MOVE_CARD_MUTATION, {
      projectId: props.projectId,
      itemId: projectItemId,
      fieldId: props.statusFieldId,
      optionId: selectedColumnId.value,
    })

    const viewerLogin = localStorage.getItem('github_viewer_login') ?? ''
    const viewerAvatar = localStorage.getItem('github_viewer_avatar') ?? ''

    const card: CardData = {
      id: projectItemId,
      contentId: issue.id,
      title: issue.title,
      number: issue.number,
      url: issue.url,
      state: 'OPEN',
      bodyHTML: issue.bodyHTML,
      typename: 'Issue',
      labels: [],
      assignees: [],
      author: { login: viewerLogin, avatarUrl: viewerAvatar },
    }

    emit('created', card, selectedColumnId.value!)
    open.value = false
  } catch (e: any) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Create Issue" description="Create a new issue and add it to the board.">
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-muted">Repository</label>
            <USelect
              v-model="selectedRepoId"
              :items="repoItems"
              :loading="loadingRepos"
              placeholder="Select repo…"
              icon="i-lucide-git-fork"
              class="w-full"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-muted">Column</label>
            <USelect
              v-model="selectedColumnId"
              :items="columnItems"
              placeholder="Select column…"
              icon="i-lucide-columns-3"
              class="w-full"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted">Title</label>
          <UInput
            v-model="title"
            placeholder="Issue title…"
            class="w-full"
            autofocus
            @keydown.meta.enter="submit"
            @keydown.ctrl.enter="submit"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted">Description <span class="text-dimmed font-normal">(optional, markdown)</span></label>
          <UTextarea
            v-model="body"
            placeholder="Describe the issue…"
            :rows="5"
            autoresize
            class="w-full"
            @keydown.meta.enter="submit"
            @keydown.ctrl.enter="submit"
          />
        </div>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancel
        </UButton>
        <UButton
          color="primary"
          :loading="submitting"
          :disabled="!canSubmit"
          icon="i-lucide-plus"
          @click="submit"
        >
          Create Issue
        </UButton>
      </div>
    </template>
  </UModal>
</template>
