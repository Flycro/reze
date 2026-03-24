<script setup lang="ts">
const { isAuthenticated } = useAuth()

if (isAuthenticated.value) {
  navigateTo('/orgs')
} else {
  navigateTo('/login')
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <UProgress animation="carousel" size="sm" class="w-48" />
  </div>
</template>
