export type OwnerType = 'org' | 'user'

export function adaptQuery(query: string, ownerType: OwnerType): string {
  if (ownerType === 'user') {
    return query.replace(/organization\(/g, 'user(')
  }
  return query
}

export function getOwner(data: any, ownerType: OwnerType) {
  return ownerType === 'user' ? data.user : data.organization
}

export function ownerPath(ownerType: OwnerType, login: string): string {
  return ownerType === 'user' ? `/users/${login}/projects` : `/orgs/${login}/projects`
}
