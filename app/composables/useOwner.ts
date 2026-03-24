import type { OwnerType } from '~/utils/owner'

export function useOwner() {
  const route = useRoute()
  const path = route.path

  const ownerType = computed<OwnerType>(() =>
    path.startsWith('/users/') ? 'user' : 'org'
  )

  const ownerLogin = computed(() =>
    (route.params.user as string) ?? (route.params.org as string) ?? ''
  )

  return { ownerType, ownerLogin }
}
