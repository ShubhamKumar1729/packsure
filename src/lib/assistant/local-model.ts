/**
 * The on-device conversational language model.
 *
 * SmolLM2-135M-Instruct is a genuinely small open-source instruction-tuned transformer: 135M
 * parameters, about 70 MB of q4 ONNX weights plus a ~4 MB tokenizer. That is the smallest
 * instruction-tuned model with public ONNX exports, i.e. the floor for a conversational assistant. It is downloaded once from the
 * open Hugging Face repository, cached by the browser, and executed locally through WebGPU when
 * available or WebAssembly otherwise. There is no API key, no external inference service, and
 * nothing for the user to install.
 */

import { pickDevice } from '@/lib/assistant/rag'

export const LOCAL_MODEL = {
  id: 'onnx-community/SmolLM2-135M-Instruct',
  dtype: 'q4' as const,
  parameters: '135M',
  approxDownloadMB: 70,
  contextTokens: 2048,
}

export type ModelState =
  | { state: 'idle' }
  | { state: 'downloading'; progress: number; detail: string }
  | { state: 'ready'; device: string }
  | { state: 'error'; error: string }

export type ModelProgress = (info: { progress: number; detail: string }) => void

type Generator = {
  (input: string, options: Record<string, unknown>): Promise<{ generated_text: string }[]>
  tokenizer: { apply_chat_template(messages: { role: string; content: string }[], options: { add_generation_prompt: boolean }): string }
}

let currentState: ModelState = { state: 'idle' }
let loadPromise: Promise<Generator> | null = null
let generator: Generator | null = null
let activeDevice = 'wasm'

export function modelState(): ModelState {
  return currentState
}

export function modelDevice() {
  return activeDevice
}

type ProgressEvent = { status: string; progress?: number; file?: string; loaded?: number; total?: number }

function describe(event: ProgressEvent) {
  if (event.status === 'progress' && typeof event.progress === 'number') {
    const mb = event.loaded && event.total ? ` (${(event.loaded / 1e6).toFixed(0)} of ${(event.total / 1e6).toFixed(0)} MB)` : ''
    return `Downloading ${event.file || 'model'}${mb}`
  }
  if (event.status === 'init') return 'Loading runtime'
  if (event.status === 'ready') return 'Model ready'
  return event.status
}

async function loadOn(device: 'webgpu' | 'wasm', onProgress: ModelProgress): Promise<Generator> {
  const transformers = await import('@huggingface/transformers')
  transformers.env.allowLocalModels = false
  transformers.env.useBrowserCache = true
  return transformers.pipeline('text-generation', LOCAL_MODEL.id, {
    dtype: LOCAL_MODEL.dtype,
    device,
    progress_callback: (event: ProgressEvent) => {
      onProgress({ progress: typeof event.progress === 'number' ? event.progress : 0, detail: describe(event) })
    },
  }) as Promise<unknown> as Promise<Generator>
}

/** Loads once per session. WebGPU first for speed; WASM is the universal fallback. */
export function ensureLocalModel(onProgress: ModelProgress = () => {}): Promise<Generator> {
  if (!loadPromise) {
    loadPromise = (async () => {
      currentState = { state: 'downloading', progress: 0, detail: 'Contacting model repository' }
      const device = await pickDevice()
      try {
        generator = await loadOn(device, onProgress)
        activeDevice = device
      } catch (error) {
        if (device === 'webgpu') {
          onProgress({ progress: 0, detail: 'WebGPU unavailable, using WebAssembly' })
          generator = await loadOn('wasm', onProgress)
          activeDevice = 'wasm'
        } else {
          throw error
        }
      }
      currentState = { state: 'ready', device: activeDevice }
      return generator
    })().catch((error) => {
      loadPromise = null
      currentState = { state: 'error', error: error instanceof Error ? error.message : String(error) }
      throw error
    })
  }
  return loadPromise
}

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Runs one generation. The prompt is rendered with the model's own chat template so persona,
 * retrieved documents, tools, and history all arrive in the format it was trained on.
 */
export async function generateReply(messages: ChatTurn[], options: { maxNewTokens?: number; onToken?: (text: string) => void } = {}): Promise<string> {
  const pipe = generator || (await ensureLocalModel())
  const prompt = pipe.tokenizer.apply_chat_template(
    messages.map((message) => ({ role: message.role, content: message.content })),
    { add_generation_prompt: true },
  )
  const outputs = await pipe(prompt, {
    max_new_tokens: options.maxNewTokens ?? 220,
    temperature: 0.6,
    top_p: 0.9,
    do_sample: true,
  })
  let text = outputs?.[0]?.generated_text ?? ''
  // Some runtime versions echo the prompt back; keep only the new tokens.
  if (text.startsWith(prompt)) text = text.slice(prompt.length)
  return text.trim()
}
