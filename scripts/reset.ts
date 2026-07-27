import './_env'
import fs from 'node:fs'
import readline from 'node:readline'
import { config } from '@/lib/config'
import { migrate } from '@/db'

/**
 * Drop and recreate the database.
 *
 *   npm run db:reset            asks for confirmation
 *   npm run db:reset -- --force skips the prompt (CI)
 *
 * Deletes the -wal and -shm sidecars too: leaving a WAL behind next to a fresh
 * main file is how you get a mysteriously half-populated database.
 */

const force = process.argv.includes('--force')

async function confirm(): Promise<boolean> {
  if (force) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((resolve) =>
    rl.question(`Delete ${config.databasePath} and all local data? [y/N] `, resolve),
  )
  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

async function main() {
  if (!(await confirm())) {
    console.log('aborted')
    return
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.databasePath}${suffix}`
    if (fs.existsSync(file)) {
      fs.rmSync(file)
      console.log(`removed ${file}`)
    }
  }

  migrate((m) => console.log(`  ${m}`))
  console.log('\nfresh database ready — run `npm run sync -- --backfill` to repopulate')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
