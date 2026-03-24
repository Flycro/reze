<script setup lang="ts">
definePageMeta({ layout: false })

const { login } = useAuth()
const tokenInput = ref('')
const error = ref<string | null>(null)
const validating = ref(false)

const TOKEN_URL = 'https://github.com/settings/tokens/new?description=reze&scopes=read%3Aorg%2Crepo%2Cproject'

async function submit() {
  const t = tokenInput.value.trim()
  if (!t) return

  validating.value = true
  error.value = null

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `bearer ${t}` },
    })
    if (!res.ok) {
      error.value = 'Token rejected by GitHub — check the scopes and try again.'
      return
    }
  } catch {
    error.value = 'Could not reach GitHub — check your connection.'
    return
  } finally {
    validating.value = false
  }

  login(t)
  navigateTo('/orgs')
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-default">
    <UCard variant="subtle" class="w-full max-w-[340px] mx-4 text-center">
      <template #header>
        <div class="flex flex-col items-center gap-5">
          <RezeLogo class="h-20 text-primary" />
          <div class="flex items-center gap-2.5">
            <svg class="size-7 fill-white" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
            </svg>
            <h1 class="text-xl font-semibold text-highlighted">Sign in to GitHub</h1>
          </div>
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Create a
          <a :href="TOKEN_URL" target="_blank" rel="noreferrer" class="text-primary hover:underline">Personal Access Token</a>
          with <code class="text-xs bg-elevated px-1 py-0.5 rounded border border-default">read:org</code>,
          <code class="text-xs bg-elevated px-1 py-0.5 rounded border border-default">repo</code>, and
          <code class="text-xs bg-elevated px-1 py-0.5 rounded border border-default">project</code> scopes,
          then paste it below.
        </p>

        <p class="text-xs text-dimmed">Your token is only stored in your browser — it never leaves your machine.</p>

        <UInput
          v-model="tokenInput"
          class="w-full"
          type="password"
          placeholder="github_pat_…"
          autocomplete="off"
          :spellcheck="false"
          @keydown.enter="submit"
        />

        <p v-if="error" class="text-sm text-error">{{ error }}</p>

        <UButton
          block
          color="primary"
          :loading="validating"
          :disabled="!tokenInput.trim()"
          @click="submit"
        >
          {{ validating ? 'Checking…' : 'Sign in' }}
        </UButton>
      </div>
    </UCard>
  </div>
</template>
