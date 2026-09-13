/**
 * Troubleshooting and help information.
 */

import type { KnowledgeDoc } from './types'

export const TROUBLESHOOTING_DOCS: KnowledgeDoc[] = [
  {
    id: 'troubleshooting-login',
    title: 'Login says authentication is not configured',
    category: 'troubleshooting',
    text: 'That message means AUTH_SECRET is missing from .env.local. Copy .env.example to .env.local, set AUTH_SECRET to a long random value (openssl rand -base64 32 works), and restart the dev server, because environment variables are read only at startup.',
  },
  {
    id: 'troubleshooting-mongodb',
    title: 'MongoDB connection errors',
    category: 'troubleshooting',
    text: 'Start MongoDB locally or point MONGODB_URI at an Atlas cluster, then restart the dev server. While MongoDB is unreachable the dashboard shows a live-data connection state, lists stay empty, and record pages report that data could not be loaded; nothing is fabricated in place of real records.',
  },
  {
    id: 'troubleshooting-assistant-model',
    title: 'Pia says she is not configured or Groq failed',
    category: 'troubleshooting',
    text: 'Pia needs the server-side GROQ_API_KEY environment variable. If she reports that she is not configured, add GROQ_API_KEY to .env.local and restart the server, because environment variables are read only at startup. If she reports a rate limit or that Groq is unavailable, wait a few seconds and ask again; those conditions are temporary. The key is never sent to browsers, so a browser-side network problem is never the cause of a Pia failure.',
  },
  {
    id: 'troubleshooting-not-applicable',
    title: 'Compliance is NOT_APPLICABLE',
    category: 'troubleshooting',
    text: 'NOT_APPLICABLE means no enabled rule applied to the stored analysis. Either no rules are enabled yet (an administrator must add verified rule definitions and enable them on the Rules page), or the analysis returned no fields for the rules to test, which is the expected outcome with the mock AI provider.',
  },
  {
    id: 'troubleshooting-blank-preview',
    title: 'Camera preview went blank after moving between steps',
    category: 'troubleshooting',
    text: 'Leaving the capture step intentionally releases the camera device, and the panel returns to its off state with the enable control visible. Returning to the capture step resumes the camera automatically without a new permission prompt. A blank preview with a live indicator should not happen anymore; if a capture is attempted while the preview is not live, the app reports it and resets the panel.',
  },
]
