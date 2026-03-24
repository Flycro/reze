<p align="center">
  <a href="https://reze.octolabs.net">
    <img src=".github/assets/banner_reze.png" alt="reze" />
  </a>
</p>

<p align="center">
  A fast, keyboard-driven GitHub Project board built with <a href="https://nuxt.com">Nuxt 4</a> and <a href="https://ui.nuxt.com">Nuxt UI</a>.
  <br />
  <a href="https://reze.octolabs.net"><strong>reze.octolabs.net</strong></a>
</p>

## Features

- **Kanban board** for GitHub Projects V2 with drag-and-drop
- **Combinable filters** by user, repo, and assignment status with Shift+click to exclude
- **Command palette** (`Cmd+K`) with bang patterns: `@user`, `/repo`, `#number`, `>action`
- **Card sidebar** with timeline, comments, assignees, and move actions
- **Create issues** directly from the board
- **Keyboard-first** workflow with 15+ shortcuts (press `?` to see all)
- **Theme picker** with customizable primary and neutral colors
- **PWA** with offline caching for GitHub API responses and avatars
- **Mobile responsive** with snap-scrolling columns not recommended though

## Setup

```bash
npm install
npm run dev
```

## Auth

reze uses a GitHub Personal Access Token with `read:org`, `repo`, and `project` scopes. Your token is stored in your browser's localStorage and never leaves your machine.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Create issue |
| `Cmd+K` | Command palette |
| `J` / `↓` | Next card |
| `K` / `↑` | Previous card |
| `←` / `→` | Navigate columns |
| `E` | Write comment |
| `A` | Open assignees |
| `Cmd+A` | Assign to me |
| `Cmd+M` | Move card |
| `Cmd+P` | Move to In Progress |
| `F` | Toggle my items filter |
| `X` | Clear filters |
| `R` | Refresh board |
| `?` | Show all shortcuts |

## Docker

```bash
docker build -t reze .
docker run -p 3000:3000 reze
```

## Credits

Inspired by [Triage](https://github.com/orta/triage) by [Orta Therox](https://github.com/orta). Built with [Nuxt](https://nuxt.com) and [Nuxt UI](https://ui.nuxt.com).

## License

MIT
