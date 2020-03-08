/* eslint-disable @typescript-eslint/no-unused-vars */

import * as core from '@actions/core'
import {
  context as githubContext,
  GitHub as actionsGitHub
} from '@actions/github'
import nodeFetch from 'node-fetch'
import {execSync as childProcessExecSync} from 'child_process'
import * as marked from 'marked'
import * as t from 'io-ts'
import {isRight} from 'fp-ts/lib/Either'

const commentAuthorAssociationsType = t.array(t.string)

const commentPrefix = '@github-actions run'

async function run(): Promise<void> {
  try {
    // Avoid mangling
    const context = githubContext
    // Avoid mangling
    const GitHub = actionsGitHub
    // Avoid mangling
    const fetch = nodeFetch
    // Avoid mangling
    const execSync = childProcessExecSync
    const githubToken = core.getInput('github-token', {required: true})
    if (context.eventName === 'issue_comment') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comment: string = (context.payload as any).comment.body
      // If not command-run-request comment
      if (!comment.startsWith(commentPrefix)) {
        // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
        console.error(
          `ERROR: Invalid allowed-associations: ${allowedAssociationsStr}`
        )
        return
      }
      const allowedAssociations: string[] = allowedAssociationsEither.right
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const association = (context.payload as any).comment.author_association
      // If commenting user is not allowed to run scripts
      if (!allowedAssociations.includes(association)) {
        // eslint-disable-next-line no-console
        console.warn(
          `NOTE: The allowed associations to run scripts are ${allowedAssociationsStr}, but you are ${association}.`
        )
        return
      }
      // Create GitHub client which can be used in the user script
      const githubClient = new GitHub(githubToken)
      // Parse the comment
      const tokens = marked.lexer(comment)
      for (const token of tokens) {
        if (token.type === 'code') {
          if (token.lang === 'js' || token.lang === 'javascript') {
            // Eval JavaScript
            // NOTE: Eval result can be promise
            await eval(token.text)
          }
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`event name is not 'issue_comment': ${context.eventName}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
