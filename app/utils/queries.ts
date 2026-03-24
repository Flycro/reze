export const VIEWER_QUERY = `
  query {
    viewer {
      login
      avatarUrl
    }
  }
`

export const PROJECT_LIST_QUERY = `
  query($org: String!) {
    organization(login: $org) {
      name
      avatarUrl
      projectsV2(first: 20) {
        nodes {
          id
          number
          title
          shortDescription
          closed
          updatedAt
          items {
            totalCount
          }
        }
      }
    }
  }
`

export const KANBAN_BOARD_QUERY = `
  query($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) {
        id
        title
        fields(first: 20) {
          nodes {
            __typename
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
                color
              }
            }
          }
        }
        items(first: 100) {
          totalCount
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            id
            fieldValues(first: 10) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  field {
                    ... on ProjectV2FieldCommon {
                      id
                    }
                  }
                }
              }
            }
            content {
              __typename
              ... on Issue {
                id
                title
                number
                url
                bodyHTML
                createdAt
                updatedAt
                issueState: state
                author {
                  login
                  avatarUrl
                }
                labels(first: 5) {
                  nodes {
                    name
                    color
                  }
                }
                assignees(first: 3) {
                  nodes {
                    login
                    avatarUrl
                  }
                }
              }
              ... on PullRequest {
                id
                title
                number
                url
                bodyHTML
                createdAt
                updatedAt
                prState: state
              }
              ... on DraftIssue {
                title
                bodyHTML
              }
            }
          }
        }
      }
    }
  }
`

export const ITEMS_PAGE_QUERY = `
  query($org: String!, $number: Int!, $cursor: String!) {
    organization(login: $org) {
      projectV2(number: $number) {
        items(first: 100, after: $cursor) {
          pageInfo { endCursor hasNextPage }
          nodes {
            id
            fieldValues(first: 10) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  field { ... on ProjectV2FieldCommon { id } }
                }
              }
            }
            content {
              __typename
              ... on Issue {
                id title number url bodyHTML createdAt updatedAt
                issueState: state
                author { login avatarUrl }
                labels(first: 5) { nodes { name color } }
                assignees(first: 3) { nodes { login avatarUrl } }
              }
              ... on PullRequest { id title number url bodyHTML createdAt updatedAt prState: state }
              ... on DraftIssue { title bodyHTML }
            }
          }
        }
      }
    }
  }
`

export const MOVE_CARD_MUTATION = `
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }
    ) {
      projectV2Item {
        id
      }
    }
  }
`

export const ADD_COMMENT_MUTATION = `
  mutation($subjectId: ID!, $body: String!) {
    addComment(input: { subjectId: $subjectId, body: $body }) {
      commentEdge {
        node {
          id
        }
      }
    }
  }
`

export const CLOSE_ISSUE_MUTATION = `
  mutation($id: ID!) {
    closeIssue(input: { issueId: $id }) {
      issue {
        id
        state
      }
    }
  }
`

export const REOPEN_ISSUE_MUTATION = `
  mutation($id: ID!) {
    reopenIssue(input: { issueId: $id }) {
      issue {
        id
        state
      }
    }
  }
`

export const REOPEN_PR_MUTATION = `
  mutation($id: ID!) {
    reopenPullRequest(input: { pullRequestId: $id }) {
      pullRequest {
        id
        state
      }
    }
  }
`

export const CLOSE_PR_MUTATION = `
  mutation($id: ID!) {
    closePullRequest(input: { pullRequestId: $id }) {
      pullRequest {
        id
        state
      }
    }
  }
`

export const CREATE_ISSUE_MUTATION = `
  mutation($repositoryId: ID!, $title: String!, $body: String) {
    createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) {
      issue {
        id
        number
        url
        title
        bodyHTML
        state
        author {
          login
          avatarUrl
        }
      }
    }
  }
`

export const ADD_PROJECT_ITEM_MUTATION = `
  mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item {
        id
      }
    }
  }
`

export const ORG_REPOS_QUERY = `
  query($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 50, after: $cursor, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes {
          id
          name
          nameWithOwner
          isArchived
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`

export const REMOVE_ASSIGNEE_MUTATION = `
  mutation($assignableId: ID!, $assigneeIds: [ID!]!) {
    removeAssigneesFromAssignable(input: { assignableId: $assignableId, assigneeIds: $assigneeIds }) {
      assignable {
        ... on Issue {
          id
          assignees(first: 10) {
            nodes {
              login
              avatarUrl
            }
          }
        }
        ... on PullRequest {
          id
          assignees(first: 10) {
            nodes {
              login
              avatarUrl
            }
          }
        }
      }
    }
  }
`

export const ADD_ASSIGNEE_MUTATION = `
  mutation($assignableId: ID!, $assigneeIds: [ID!]!) {
    addAssigneesToAssignable(input: { assignableId: $assignableId, assigneeIds: $assigneeIds }) {
      assignable {
        ... on Issue {
          id
          assignees(first: 10) {
            nodes {
              login
              avatarUrl
            }
          }
        }
        ... on PullRequest {
          id
          assignees(first: 10) {
            nodes {
              login
              avatarUrl
            }
          }
        }
      }
    }
  }
`
