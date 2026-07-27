import './_env'
import { migrate } from '@/db'
import { config } from '@/lib/config'

console.log(`database: ${config.databasePath}`)
migrate((m) => console.log(`  ${m}`))
console.log('schema up to date')
