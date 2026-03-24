<script setup lang="ts">
import { VIEWER_QUERY } from '~/utils/queries'

const { logout } = useAuth()
const { graphqlCached, restCached } = useGitHub()

interface Org {
  login: string
  avatar_url: string
  description: string | null
}

const viewer = ref<{ login: string; avatarUrl: string } | null>(null)
const orgs = ref<Org[]>([])
const orgsError = ref<string | null>(null)
const lastOrg = ref<string | null>(null)
const loading = ref(true)
const search = ref('')

onMounted(async () => {
  lastOrg.value = localStorage.getItem('last_org')

  const [viewerResult, orgsResult] = await Promise.allSettled([
    graphqlCached<{ viewer: { login: string; avatarUrl: string } }>(VIEWER_QUERY),
    restCached<Org[]>('user/orgs?per_page=100'),
  ])

  if (viewerResult.status === 'fulfilled') {
    viewer.value = viewerResult.value.viewer
    localStorage.setItem('github_viewer_login', viewerResult.value.viewer.login)
    localStorage.setItem('github_viewer_avatar', viewerResult.value.viewer.avatarUrl)
  } else {
    orgsError.value = viewerResult.reason?.message ?? 'Failed to load viewer'
  }

  if (orgsResult.status === 'fulfilled') {
    orgs.value = orgsResult.value.sort((a, b) => {
      if (a.login === lastOrg.value) return -1
      if (b.login === lastOrg.value) return 1
      return 0
    })
  } else {
    orgsError.value = orgsResult.reason?.message ?? 'Failed to load organizations'
  }

  loading.value = false
})

const filteredOrgs = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return orgs.value
  return orgs.value.filter(o => o.login.toLowerCase().includes(q))
})

function selectOrg(org: Org) {
  localStorage.setItem('last_org', org.login)
  lastOrg.value = org.login
  navigateTo(`/orgs/${org.login}/projects`)
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header -->
    <header class="border-b border-default shrink-0">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/orgs">
          <RezeLogo class="h-8 text-primary" />
        </NuxtLink>
        <div class="flex items-center gap-2">
          <UUser
            v-if="viewer"
            :name="viewer.login"
            :avatar="{ src: viewer.avatarUrl, alt: viewer.login }"
            size="sm"
          />
          <ThemeSettings />
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-log-out" @click="logout">
            Sign out
          </UButton>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-2xl font-bold text-highlighted">Organizations</h2>
            <p class="text-sm text-muted mt-1">Select an organization to view its projects</p>
          </div>
          <UInput
            v-if="orgs.length > 5"
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search organizations…"
            size="sm"
            class="w-48"
          />
        </div>

        <div v-if="orgsError" class="mb-6">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            title="Failed to load"
            :description="orgsError"
          />
        </div>

        <div v-if="loading" class="flex items-center justify-center py-16">
          <UProgress animation="carousel" size="xs" class="w-48" />
        </div>

        <div v-else-if="filteredOrgs.length === 0 && search" class="text-center py-12">
          <UIcon name="i-lucide-search-x" class="size-10 text-dimmed mx-auto mb-3" />
          <p class="text-muted">No organizations matching "{{ search }}"</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <UCard
            v-for="org in filteredOrgs"
            :key="org.login"
            variant="subtle"
            class="cursor-pointer transition-all hover:ring-primary"
            :class="org.login === lastOrg ? 'ring-primary' : ''"
            @click="selectOrg(org)"
          >
            <div class="flex items-center gap-3">
              <UAvatar :src="org.avatar_url" :alt="org.login" size="lg" :ui="{ rounded: 'rounded-lg' }" />
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-highlighted truncate">{{ org.login }}</div>
                <div v-if="org.description" class="text-xs text-muted truncate mt-0.5">{{ org.description }}</div>
                <UBadge v-if="org.login === lastOrg" size="sm" variant="subtle" color="primary" class="mt-1">
                  Last used
                </UBadge>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
            </div>
          </UCard>
        </div>
      </div>
    </main>
  </div>
</template>
