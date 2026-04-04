<script setup lang="ts">
import { CREATE_ISSUE_MUTATION, ADD_PROJECT_ITEM_MUTATION, MOVE_CARD_MUTATION, ORG_REPOS_QUERY } from '~/utils/queries'
import type { CardData, ColumnOption } from '~/utils/types'
import type { IssueTemplate, FormField } from '~/utils/issueTemplates'
import { parseTemplate, serializeFormFields } from '~/utils/issueTemplates'
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

const { graphqlMutation, rest } = useGitHub()

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

const templates = ref<IssueTemplate[]>([])
const selectedTemplate = ref<string | null>(null)
const loadingTemplates = ref(false)
const templateCache = new Map<string, IssueTemplate[]>()

const activeTemplate = computed(() =>
  templates.value.find(t => t.fileName === selectedTemplate.value)
)

const hasFormFields = computed(() =>
  (activeTemplate.value?.fields.length ?? 0) > 0
)

const formValues = ref<Record<string, any>>({})

watch(open, async (isOpen) => {
  if (isOpen && repos.value.length === 0) {
    await loadRepos()
  }
  if (isOpen) {
    title.value = ''
    body.value = ''
    error.value = null
    templates.value = []
    selectedTemplate.value = null
    formValues.value = {}
    selectedColumnId.value = props.columns[0]?.id ?? null
    selectedRepoId.value = null
    await nextTick()
    if (props.activeRepoFilter?.length === 1 && repos.value.length > 0) {
      const match = repos.value.find(r => r.name === props.activeRepoFilter![0])
      if (match) selectedRepoId.value = match.id
    } else if (props.boardRepos.length > 0 && repos.value.length > 0) {
      const topRepo = repos.value.find(r => r.name === props.boardRepos[0]?.name)
      if (topRepo) selectedRepoId.value = topRepo.id
    }
  }
})

const selectedRepo = computed(() =>
  repos.value.find(r => r.id === selectedRepoId.value)
)

watch(selectedRepoId, async () => {
  templates.value = []
  selectedTemplate.value = null
  formValues.value = {}
  if (selectedRepo.value) {
    await loadTemplates(selectedRepo.value.nameWithOwner)
  }
})

async function loadTemplates(nameWithOwner: string) {
  const cached = templateCache.get(nameWithOwner)
  if (cached) {
    templates.value = cached
    return
  }

  loadingTemplates.value = true
  try {
    const files = await rest<Array<{ name: string; download_url: string }>>(
      `repos/${nameWithOwner}/contents/.github/ISSUE_TEMPLATE`
    )
    if (!Array.isArray(files)) {
      templateCache.set(nameWithOwner, [])
      return
    }

    const templateFiles = files.filter(f =>
      (f.name.endsWith('.md') || f.name.endsWith('.yml') || f.name.endsWith('.yaml'))
      && f.name !== 'config.yml' && f.name !== 'config.yaml'
    )

    const parsed: IssueTemplate[] = []
    for (const file of templateFiles) {
      try {
        const res = await fetch(file.download_url)
        const raw = await res.text()
        parsed.push(parseTemplate(raw, file.name))
      } catch {}
    }

    templateCache.set(nameWithOwner, parsed)
    templates.value = parsed
  } catch {
    templateCache.set(nameWithOwner, [])
  } finally {
    loadingTemplates.value = false
  }
}

function initFormValues(fields: FormField[]) {
  const vals: Record<string, any> = {}
  for (const f of fields) {
    if (!f.id) continue
    if (f.type === 'checkboxes') {
      vals[f.id] = (f.options ?? []).map(() => false)
    } else if (f.type === 'textarea' || f.type === 'input') {
      vals[f.id] = f.value ?? ''
    } else {
      vals[f.id] = ''
    }
  }
  return vals
}

function applyTemplate(fileName: string | null) {
  selectedTemplate.value = fileName
  if (!fileName) {
    title.value = ''
    body.value = ''
    formValues.value = {}
    return
  }
  const tmpl = templates.value.find(t => t.fileName === fileName)
  if (!tmpl) return
  title.value = tmpl.title
  if (tmpl.fields.length > 0) {
    body.value = ''
    formValues.value = initFormValues(tmpl.fields)
  } else {
    body.value = tmpl.body
    formValues.value = {}
  }
}

const templateItems = computed(() => {
  const items: Array<{ label: string; value: string }> = [
    { label: 'Blank issue', value: '__blank__' },
  ]
  for (const t of templates.value) {
    items.push({ label: t.name, value: t.fileName })
  }
  return items
})

function getSubmitBody(): string {
  if (hasFormFields.value && activeTemplate.value) {
    return serializeFormFields(activeTemplate.value.fields, formValues.value)
  }
  return body.value.trim()
}

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
  repos.value.map(r => ({ label: r.name, value: r.id }))
)

const columnItems = computed(() =>
  props.columns.map(c => ({ label: c.name, value: c.id }))
)

const canSubmit = computed(() =>
  title.value.trim() && selectedRepoId.value && selectedColumnId.value && !submitting.value
)

function toggleCheckbox(fieldId: string, index: number) {
  const arr = [...(formValues.value[fieldId] ?? [])]
  arr[index] = !arr[index]
  formValues.value = { ...formValues.value, [fieldId]: arr }
}

function updateFormValue(fieldId: string, value: any) {
  formValues.value = { ...formValues.value, [fieldId]: value }
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null

  try {
    const issueBody = getSubmitBody() || null

    const issueData = await graphqlMutation<any>(CREATE_ISSUE_MUTATION, {
      repositoryId: selectedRepoId.value,
      title: title.value.trim(),
      body: issueBody,
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
      <div class="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
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

        <div v-if="templates.length > 0 || loadingTemplates" class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted">Template</label>
          <USelect
            :model-value="selectedTemplate ?? '__blank__'"
            :items="templateItems"
            :loading="loadingTemplates"
            icon="i-lucide-file-text"
            class="w-full"
            @update:model-value="applyTemplate($event === '__blank__' ? null : $event)"
          />
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

        <template v-if="hasFormFields && activeTemplate">
          <template v-for="field in activeTemplate.fields" :key="field.id ?? field.value">
            <div v-if="field.type === 'markdown'" class="text-[13px] text-muted gh-content" v-html="field.value" />

            <div v-else-if="field.type === 'textarea' && field.id" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-muted">
                {{ field.label }}<span v-if="field.required" class="text-error"> *</span>
              </label>
              <p v-if="field.description" class="text-[11px] text-dimmed -mt-0.5">{{ field.description }}</p>
              <UTextarea
                :model-value="formValues[field.id] ?? ''"
                :placeholder="field.placeholder"
                :rows="4"
                autoresize
                class="w-full"
                @update:model-value="updateFormValue(field.id!, $event)"
                @keydown.meta.enter="submit"
                @keydown.ctrl.enter="submit"
              />
            </div>

            <div v-else-if="field.type === 'input' && field.id" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-muted">
                {{ field.label }}<span v-if="field.required" class="text-error"> *</span>
              </label>
              <p v-if="field.description" class="text-[11px] text-dimmed -mt-0.5">{{ field.description }}</p>
              <UInput
                :model-value="formValues[field.id] ?? ''"
                :placeholder="field.placeholder"
                class="w-full"
                @update:model-value="updateFormValue(field.id!, $event)"
                @keydown.meta.enter="submit"
                @keydown.ctrl.enter="submit"
              />
            </div>

            <div v-else-if="field.type === 'dropdown' && field.id" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-muted">
                {{ field.label }}<span v-if="field.required" class="text-error"> *</span>
              </label>
              <p v-if="field.description" class="text-[11px] text-dimmed -mt-0.5">{{ field.description }}</p>
              <USelect
                :model-value="formValues[field.id] ?? ''"
                :items="(field.options ?? []).map(o => ({ label: o, value: o }))"
                :placeholder="field.placeholder || 'Select…'"
                class="w-full"
                @update:model-value="updateFormValue(field.id!, $event)"
              />
            </div>

            <div v-else-if="field.type === 'checkboxes' && field.id" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-muted">
                {{ field.label }}<span v-if="field.required" class="text-error"> *</span>
              </label>
              <p v-if="field.description" class="text-[11px] text-dimmed -mt-0.5">{{ field.description }}</p>
              <div class="flex flex-col gap-1">
                <label
                  v-for="(opt, oi) in field.options"
                  :key="oi"
                  class="flex items-center gap-2 text-[13px] text-highlighted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="formValues[field.id]?.[oi] ?? false"
                    class="rounded border-default"
                    @change="toggleCheckbox(field.id!, oi)"
                  >
                  {{ opt }}
                </label>
              </div>
            </div>
          </template>
        </template>

        <div v-else class="flex flex-col gap-1.5">
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
