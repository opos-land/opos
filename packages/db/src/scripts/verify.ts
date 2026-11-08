import postgres from 'postgres'
import { migrationUrl } from '../migration-url'
import { verifyDatabase } from '../verify'

const sql = postgres(migrationUrl(), { max: 1, onnotice: () => {} })

try {
  const problems = await sql.begin((tx) => verifyDatabase(tx))
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exitCode = 1
  } else {
    console.log(
      'Every public relation follows the tenant isolation rules, and the roles hold only the privileges the rules allow.',
    )
  }
} finally {
  await sql.end()
}
