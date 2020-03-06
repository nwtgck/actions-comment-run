/* eslint-disable @typescript-eslint/no-unused-vars */

import * as core from '@actions/core'
// context can be used in the user script
import {context, GitHub} from '@actions/github'
// fetch() can be used in the user script
import fetch from 'node-fetch'
// execSync() can be used in the user script
import {execSync} from 'child_process'
import * as marked from 'marked'

const commentPrefix = '@github-actions run'

async function run(): Promise<void> {
  try {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const association = (context.payload as any).comment.author_association
      // If commenting user has no write permission
      if (!(association === 'OWNER' || association === 'COLLABORATOR')) {
        // eslint-disable-next-line no-console
        console.warn(
          `NOTE: The owner and the collaborators can trigger this action, but you are ${association}.`
        )
        return
      }
      // Create GitHub client which can be used in the user script
      const githubClient = new GitHub(githubToken)
      // Parse the comment
      const tokens = marked.lexer(comment)
      for (const t of tokens) {
        if (t.type === 'code') {
          if (t.lang === 'js' || t.lang === 'javascript') {
            // Eval JavaScript
            // NOTE: Eval result can be promise
            await eval(t.text)
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
