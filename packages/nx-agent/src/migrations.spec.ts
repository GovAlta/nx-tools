import * as fs from 'fs'
import * as path from 'path'

/**
 * Guards the migration registry against an unreachable `version`.
 *
 * `nx migrate` only collects migrations where
 * `installed < version <= target`, so a version above the package's own
 * release line can never be selected — the migration is registered, packaged,
 * and dead. `rename-service-descriptions-to-product-briefs` shipped that way
 * for five minor releases: authored for 1.22.0, registered as `12.2.0`
 * (transposed), and therefore never run by any consumer.
 *
 * @abgov/nx-agent publishes on the 1.x line — unlike nx-oc/nx-adsp it is not
 * pinned to `Nx major - 10`, which is what makes a 12.x/13.x version look
 * plausible here. On a major bump, update MAJOR_LINE.
 */
describe('migrations registry', () => {
  const MAJOR_LINE = 1

  const registry = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'migrations.json'), 'utf-8'),
  )
  const entries: [string, { version?: string }][] = Object.entries(
    registry.generators ?? {},
  )

  it('registers at least one migration', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it.each(entries)(
    'registers %s with a version on the published major line',
    (_name, migration) => {
      expect(migration.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
      expect(Number(migration.version.split('.')[0])).toBe(MAJOR_LINE)
    },
  )
})
