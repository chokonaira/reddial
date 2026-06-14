import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const trySh = (cmd) => {
  try {
    return sh(cmd)
  } catch {
    return null
  }
}

if (process.env.GITHUB_ACTIONS) process.exit(0)

try {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  const tag = `v${version}`

  if (trySh(`gh release view ${tag} --json tagName`) !== null) {
    console.log(`[sync-release] ${tag} release already exists.`)
    process.exit(0)
  }

  const committed = trySh('git show HEAD:package.json')
  if (committed && JSON.parse(committed).version !== version) {
    console.warn(
      `[sync-release] HEAD is ${JSON.parse(committed).version} but ${version} was published. ` +
        `Commit the version bump and push, then run: gh release create ${tag} --generate-notes`,
    )
    process.exit(0)
  }

  if (trySh(`git rev-parse ${tag}`) === null) {
    sh(`git tag ${tag}`)
    trySh(`git push origin ${tag}`)
  }
  execSync(`gh release create ${tag} --title "RedDial ${tag}" --generate-notes`, { stdio: 'inherit' })
  console.log(`[sync-release] Created GitHub release ${tag}.`)
} catch (err) {
  console.warn(`[sync-release] Skipped release sync: ${err.message}`)
}
