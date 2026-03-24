<script setup lang="ts">
import { PROJECT_LIST_QUERY } from '~/utils/queries'
import { adaptQuery, getOwner, ownerPath } from '~/utils/owner'

const { ownerType, ownerLogin: org } = useOwner()

useHead({ title: `reze - ${org.value}` })
const { graphqlCached } = useGitHub()

const orgData = ref<{ name: string | null; avatarUrl: string | null } | null>(null)
const projects = ref<Array<{
  id: string
  number: number
  title: string
  shortDescription: string | null
  closed: boolean
  updatedAt: string
  items: { totalCount: number }
}>>([])
const lastProject = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  lastProject.value = localStorage.getItem(`last_project_${org.value}`)

  try {
    const query = adaptQuery(PROJECT_LIST_QUERY, ownerType.value)
    const data = await graphqlCached<any>(query, { org: org.value })
    const owner = getOwner(data, ownerType.value)

    orgData.value = { name: owner?.name ?? null, avatarUrl: owner?.avatarUrl ?? null }

    projects.value = (owner?.projectsV2?.nodes ?? [])
      .filter((p: any): p is NonNullable<typeof p> => !!p && !p.closed)
      .sort((a: any, b: any) => {
        if (String(a.number) === lastProject.value) return -1
        if (String(b.number) === lastProject.value) return 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
  } finally {
    loading.value = false
  }
})

const basePath = computed(() => ownerPath(ownerType.value, org.value))

function selectProject(project: typeof projects.value[0]) {
  localStorage.setItem(`last_project_${org.value}`, String(project.number))
  lastProject.value = String(project.number)
  navigateTo(`${basePath.value}/${project.number}`)
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-default shrink-0">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/orgs">
            <RezeLogo class="h-7 text-primary" />
          </NuxtLink>
          <USeparator orientation="vertical" class="h-5" />
          <UAvatar v-if="orgData?.avatarUrl" :src="orgData.avatarUrl" :alt="org" size="sm" :ui="{ rounded: 'rounded-lg' }" />
          <div>
            <h1 class="text-lg font-semibold text-highlighted">{{ orgData?.name ?? org }}</h1>
            <p v-if="orgData?.name" class="text-xs text-dimmed">{{ org }}</p>
          </div>
        </div>
        <ThemeSettings />
      </div>
    </header>

    <main class="flex-1">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-2xl font-bold text-highlighted">Projects</h2>
            <p class="text-sm text-muted mt-1">Select a project board to start triaging</p>
          </div>
          <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-arrow-left" @click="navigateTo('/orgs')">
            All organizations
          </UButton>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-16">
          <UProgress animation="carousel" size="xs" class="w-48" />
        </div>

        <div v-else-if="projects.length === 0" class="text-center py-16">
          <UIcon name="i-lucide-kanban" class="size-12 text-dimmed mx-auto mb-3" />
          <p class="text-lg font-medium text-muted">No open projects</p>
          <p class="text-sm text-dimmed mt-1">No active GitHub Projects found</p>
        </div>

        <div v-else class="flex flex-col gap-2">
          <UCard
            v-for="project in projects"
            :key="project.id"
            variant="subtle"
            class="cursor-pointer transition-all hover:ring-primary"
            :class="String(project.number) === lastProject ? 'ring-primary' : ''"
            @click="selectProject(project)"
          >
            <div class="flex items-center gap-4">
              <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
                <UIcon name="i-lucide-kanban" class="size-5 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-highlighted">{{ project.title }}</span>
                  <UBadge v-if="String(project.number) === lastProject" size="sm" variant="subtle" color="primary">
                    Last used
                  </UBadge>
                </div>
                <p v-if="project.shortDescription" class="text-sm text-muted truncate mt-0.5">
                  {{ project.shortDescription }}
                </p>
                <div class="flex items-center gap-3 mt-1.5">
                  <span class="flex items-center gap-1 text-xs text-dimmed">
                    <UIcon name="i-lucide-layers" class="size-3" />
                    {{ project.items.totalCount }} items
                  </span>
                  <span class="flex items-center gap-1 text-xs text-dimmed">
                    <UIcon name="i-lucide-clock" class="size-3" />
                    Updated {{ formatDate(project.updatedAt) }}
                  </span>
                </div>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
            </div>
          </UCard>
        </div>
      </div>
    </main>
  </div>
</template>
