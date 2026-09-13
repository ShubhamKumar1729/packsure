import { AnthropicAssistantProvider } from '@/lib/assistant/anthropic-provider'
import { AssistantModelError } from '@/lib/assistant/model-error'
import { GeminiAssistantProvider } from '@/lib/assistant/gemini-provider'
import { MockAssistantProvider } from '@/lib/assistant/mock-provider'
import { OpenAICompatibleProvider } from '@/lib/assistant/openai-provider'
import type { AssistantAnswer, AssistantProvider, AssistantProviderInput } from '@/lib/assistant/types'

/**
 * Provider selection stays entirely server-side. Every provider receives the results of the
 * authorized tools in `src/lib/assistant/tools.ts`; none of them ever receives a database handle,
 * a Mongoose model, or a connection string.
 */

function env(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

type Descriptor = {
  id: string
  label: string
  /** Never selected automatically; the user must ask for it by name. */
  explicitOnly?: boolean
  resolve: () => { provider: AssistantProvider; missing?: string } | null
}

function descriptors(): Descriptor[] {
  return [
    {
      id: 'openai',
      label: 'OpenAI',
      resolve: () => {
        const apiKey = env('OPENAI_API_KEY')
        if (!apiKey) return null
        return {
          provider: new OpenAICompatibleProvider({
            id: 'openai',
            label: 'OpenAI',
            baseUrl: env('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
            apiKey,
            model: env('ASSISTANT_MODEL') || env('OPENAI_MODEL') || 'gpt-4o-mini',
          }),
        }
      },
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      resolve: () => {
        const apiKey = env('ANTHROPIC_API_KEY')
        if (!apiKey) return null
        return {
          provider: new AnthropicAssistantProvider({
            baseUrl: env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com',
            apiKey,
            model: env('ASSISTANT_MODEL') || env('ANTHROPIC_MODEL') || 'claude-sonnet-4-5',
          }),
        }
      },
    },
    {
      id: 'gemini',
      label: 'Gemini',
      resolve: () => {
        const apiKey = env('GEMINI_API_KEY')
        if (!apiKey) return null
        return {
          provider: new GeminiAssistantProvider({
            baseUrl: env('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com/v1beta',
            apiKey,
            model: env('ASSISTANT_MODEL') || env('GEMINI_MODEL') || 'gemini-2.5-flash',
          }),
        }
      },
    },
    {
      id: 'groq',
      label: 'Groq',
      resolve: () => {
        const apiKey = env('GROQ_API_KEY')
        if (!apiKey) return null
        return {
          provider: new OpenAICompatibleProvider({
            id: 'groq',
            label: 'Groq',
            baseUrl: env('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1',
            apiKey,
            model: env('ASSISTANT_MODEL') || env('GROQ_MODEL') || 'llama-3.3-70b-versatile',
          }),
        }
      },
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      resolve: () => {
        const apiKey = env('OPENROUTER_API_KEY')
        if (!apiKey) return null
        return {
          provider: new OpenAICompatibleProvider({
            id: 'openrouter',
            label: 'OpenRouter',
            baseUrl: env('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1',
            apiKey,
            model: env('ASSISTANT_MODEL') || env('OPENROUTER_MODEL') || 'openai/gpt-4o-mini',
            extraHeaders: { 'x-title': 'PackSure' },
          }),
        }
      },
    },
    {
      // A local model server needs no key, so it must be requested explicitly rather than guessed.
      id: 'ollama',
      label: 'Ollama',
      explicitOnly: true,
      resolve: () => ({
        provider: new OpenAICompatibleProvider({
          id: 'ollama',
          label: 'Ollama',
          baseUrl: env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434/v1',
          apiKey: env('OLLAMA_API_KEY') || 'ollama',
          model: env('ASSISTANT_MODEL') || env('OLLAMA_MODEL') || 'llama3.2',
        }),
      }),
    },
  ]
}

/**
 * Tries the configured model and, if it fails for any reason, answers from the built-in offline
 * responder while telling the user exactly why the model was not used. A misconfigured key must
 * never leave the assistant silently broken.
 */
class ResilientAssistantProvider implements AssistantProvider {
  readonly id: string
  readonly version: string
  private readonly primary: AssistantProvider
  private readonly fallback: AssistantProvider

  constructor(primary: AssistantProvider, fallback: AssistantProvider) {
    this.primary = primary
    this.fallback = fallback
    this.id = primary.id
    this.version = primary.version
  }

  async answer(input: AssistantProviderInput): Promise<AssistantAnswer> {
    try {
      return await this.primary.answer(input)
    } catch (error) {
      const reason = error instanceof AssistantModelError || error instanceof Error ? error.message : 'The configured model did not respond.'
      console.error('Assistant model failure, degrading to offline responder', error)
      const answer = await this.fallback.answer(input)
      return { ...answer, notice: `The configured model could not answer: ${reason} This reply came from PackSure's built-in offline responder instead.` }
    }
  }
}

export function getAssistantProvider(): AssistantProvider {
  const requested = (env('ASSISTANT_PROVIDER') || 'auto').toLowerCase()
  const fallback = new MockAssistantProvider()

  if (['mock', 'offline', 'off', 'none', 'disabled'].includes(requested)) return fallback

  // A generic OpenAI-compatible endpoint configured directly wins over the named presets, so any
  // gateway or self-hosted inference server can be used without new code.
  const genericKey = env('ASSISTANT_API_KEY')
  const genericBase = env('ASSISTANT_BASE_URL')
  if (genericKey && genericBase) {
    const provider = new OpenAICompatibleProvider({
      id: requested === 'auto' ? 'assistant-model' : requested,
      label: 'The configured assistant model',
      baseUrl: genericBase,
      apiKey: genericKey,
      model: env('ASSISTANT_MODEL') || 'gpt-4o-mini',
    })
    return new ResilientAssistantProvider(provider, fallback)
  }

  const available = descriptors()

  if (requested !== 'auto') {
    const descriptor = available.find((candidate) => candidate.id === requested)
    if (!descriptor) {
      console.error(`Unknown ASSISTANT_PROVIDER "${requested}"; using the offline responder.`)
      return new MockAssistantProvider(`ASSISTANT_PROVIDER is set to "${requested}", which PackSure does not recognize. Supported values are auto, openai, anthropic, gemini, groq, openrouter, ollama, and mock. This reply came from the built-in offline responder.`)
    }
    const resolved = descriptor.resolve()
    if (!resolved) {
      return new MockAssistantProvider(`ASSISTANT_PROVIDER is set to "${descriptor.id}" but no API key was found for it. Add the matching key to .env.local. This reply came from the built-in offline responder.`)
    }
    return new ResilientAssistantProvider(resolved.provider, fallback)
  }

  // Auto: use the first provider that actually has credentials configured.
  for (const descriptor of available) {
    if (descriptor.explicitOnly) continue
    const resolved = descriptor.resolve()
    if (resolved) return new ResilientAssistantProvider(resolved.provider, fallback)
  }
  return fallback
}
