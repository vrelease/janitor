/* standard */
import util from 'util'

/* 3rd-party */
import _ from 'lodash'
import chalk from 'chalk'
import semver from 'semver'
import { Octokit } from '@octokit/rest'

interface IRepoTag {
  name: string
}

interface IRepoRelease {
  id: number
  name: string | null
  tag: string
}

interface IRepo {
  tags: IRepoTag[]
  releases: IRepoRelease[]
}

const fmt = util.format
const len = (a: any[] | string): number => a.length

const authenticate = async (): Promise<Octokit> => {
  const octo = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN })
  const auth = await octo.rest.users.getAuthenticated()

  const login = chalk.cyan(fmt('@%s', auth.data.login))
  const name = auth.data.name !== undefined ? fmt('(%s)', chalk.italic(auth.data.name)) : ''
  console.info(fmt('authenticated as %s %s', login, name))

  return octo
}

const getRepoInfo = async (octo: Octokit, owner: string, repo: string): Promise<IRepo> => {
  const tags: IRepoTag[] = []
  const releases: IRepoRelease[] = []

  const fy = (o: object): string => JSON.stringify(o, null, 2)

  for (let page = 1; ; page++) {
    const p = { owner, repo, page, per_page: 50 }
    const { status: tagStatus, data: t } = await octo.rest.repos.listTags(p)
    const { status: relStatus, data: r } = await octo.rest.repos.listReleases(p)

    if (tagStatus !== 200) {
      throw new Error(fy(t))
    }

    if (relStatus !== 200) {
      throw new Error(fy(r))
    }

    if (len(t) === 0 && len(r) === 0) {
      break
    }

    tags.push(...t.map((i) => ({ name: i.name })))
    releases.push(...r.map((i) => ({ id: i.id, name: i.name, tag: i.tag_name })))
  }

  return { tags, releases }
}

const main = async (): Promise<void> => {
  const owner = 'vrelease'
  const repo = 'vrtp'

  const octo = await authenticate()
  const { tags, releases } = await getRepoInfo(octo, owner, repo)

  const invalidTags = tags.filter((t) => semver.valid(t.name) === null)
  const validTags = _.xor(tags, invalidTags)

  const invalidReleases = releases.filter((r) => semver.valid(r.tag) === null)
  const validReleases = _.xor(releases, invalidReleases)

  console.log(
    fmt(
      'found %d releases (%d valid; %d invalid)',
      len(releases),
      len(validReleases),
      len(invalidReleases)
    )
  )

  console.log(
    fmt('found %d tags (%d valid; %d invalid)', len(tags), len(validTags), len(invalidTags))
  )

  for (const tag of invalidTags) {
    await octo.rest.git.deleteRef({ owner, repo, ref: fmt('tags/%s', tag.name) })
    console.log(chalk.redBright(fmt('tag "%s" deleted', tag.name)))
  }

  for (const release of invalidReleases) {
    await octo.rest.repos.deleteRelease({ owner, repo, release_id: release.id })
    console.log(chalk.redBright(fmt('release "%s" deleted', release.name)))
  }

  console.log('finished')
}

main().catch((e) => console.error(e))
