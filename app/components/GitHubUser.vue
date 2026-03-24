<script setup lang="ts">
const props = defineProps<{
  login: string
  bold?: boolean
}>()

const router = useRouter()
const route = useRoute()

function onClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    e.stopPropagation()
    const current = route.query.filter === 'user' && route.query.user === props.login
    router.replace({
      query: current ? {} : { filter: 'user', user: props.login }
    })
  }
}
</script>

<template>
  <a
    :href="`https://github.com/${login}`"
    target="_blank"
    rel="noopener noreferrer"
    class="no-underline hover:underline"
    :class="bold ? 'text-toned font-medium' : 'text-muted'"
    :title="`${login} — ⌘/Ctrl+click to filter`"
    @click="onClick"
  >{{ login }}</a>
</template>
