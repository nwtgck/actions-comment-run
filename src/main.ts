import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
import * as exec from '@actions/exec'
import fetch from 'node-fetch'
import {execSync} from 'child_process'
import * as marked from 'marked'
import * as t from 'io-ts'
import {isRight} from 'fp-ts/lib/Either'
import * as fs from 'fs'

import {callAsyncFunction} from './async-function'

const commentAuthorAssociationsType = t.array(t.string)

const commentPrefix = '@github-actions run'

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github-token', {required: true})
    if (context.eventName !== 'issue_comment') {
      console.warn(`event name is not 'issue_comment': ${context.eventName}`)
      return
    }
    // Create GitHub client which can be used in the user script
    const githubClient = new GitHub(githubToken)
    const permissionRes =
      await githubClient.repos.getCollaboratorPermissionLevel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        username: context.actor
      })
    if (permissionRes.status !== 200) {
      console.error(
        `Permission check returns non-200 status: ${permissionRes.status}`
      )
      return
    }
    const actorPermission = permissionRes.data.permission
    if (!['admin', 'write'].includes(actorPermission)) {
      console.error(
        `ERROR: ${context.actor} does not have admin/write permission: ${actorPermission}`
      )
      return
    }
    const comment: string = (context.payload as any).comment.body
    // If not command-run-request comment
    if (!comment.startsWith(commentPrefix)) {
      console.log(
        `HINT: Comment-run is triggered when your comment start with "${commentPrefix}"`
      )
      return
    }
    // Get allowed associations
    const allowedAssociationsStr = core.getInput('allowed-associations')
    // Parse and validate
    const allowedAssociationsEither = commentAuthorAssociationsType.decode(
      JSON.parse(allowedAssociationsStr)
    )
    if (!isRight(allowedAssociationsEither)) {
      console.error(
        `ERROR: Invalid allowed-associations: ${allowedAssociationsStr}`
      )
      return
    }
    const allowedAssociations: string[] = allowedAssociationsEither.right
    const association = (context.payload as any).comment.author_association
    // If commenting user is not allowed to run scripts
    if (!allowedAssociations.includes(association)) {
      console.warn(
        `NOTE: The allowed associations to run scripts are ${allowedAssociationsStr}, but you are ${association}.`
      )
      return
    }
    // Add :eyes: reaction
    const reactionRes = await githubClient.reactions
      .createForIssueComment({
        comment_id: (context.payload as any).comment.id,
        content: 'eyes',
        owner: context.repo.owner,
        repo: context.repo.repo
      })
      .catch(err => {
        console.error('Add-eyes-reaction failed')
      })
    // Post GitHub issue comment
    const postComment = async (body: string): Promise<void> => {
      await githubClient.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body
      })
    }
    // Parse the comment
    const tokens = marked.Lexer.lex(comment)
    for (const token of tokens) {
      if (token.type === 'code') {
        if (token.lang === 'js' || token.lang === 'javascript') {
          // Eval JavaScript
          await callAsyncFunction(
            {
              require,
              core,
              exec,
              fetch,
              context,
              GitHub,
              githubToken,
              githubClient,
              execSync,
              postComment
            },
            token.text
          )
        } else if (token.text.startsWith('#!')) {
          // Execute script with shebang
          await executeShebangScript(token.text)
        }
      }
    }
    if (reactionRes !== undefined) {
      // Add +1 reaction
      await githubClient.reactions
        .createForIssueComment({
          comment_id: (context.payload as any).comment.id,
          content: '+1',
          owner: context.repo.owner,
          repo: context.repo.repo
        })
        .catch(err => {
          console.error('Add-+1-reaction failed')
        })
      // Delete eyes reaction
      await githubClient.reactions
        .delete({
          reaction_id: reactionRes.data.id
        })
        .catch(err => {
          console.error('Delete-reaction failed', err)
        })
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

function createTmpFileName(): string {
  const prefix = 'tmp_'
  const len = 32
  while (true) {
    const fileName = `${prefix}${randomString(len)}`
    if (!fs.existsSync(fileName)) return fileName
  }
}

// (base: https://stackoverflow.com/a/1349426/2885946)
function randomString(length: number): string {
  let result = ''
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

async function executeShebangScript(script: string): Promise<void> {
  // NOTE: Executing file in /tmp cause the error "UnhandledPromiseRejectionWarning: Error: There was an error when attempting to execute the process '/tmp/tmp-26373utihbUOauHW'. This may indicate the process failed to start. Error: spawn /tmp/tmp-26373utihbUOauHW ENOENT"
  const fpath = createTmpFileName()
  try {
    fs.writeFileSync(fpath, script)
    fs.chmodSync(fpath, 0o777)
    await exec.exec(`./${fpath}`, [], {
      outStream: process.stdout,
      errStream: process.stderr
    })
  } finally {
    // Remove file
    fs.unlinkSync(fpath)
  }
}

run()
