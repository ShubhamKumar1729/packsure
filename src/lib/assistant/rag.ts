/**
 * On-device retrieval (the R in RAG). The platform knowledge base is embedded in the browser with a
 * small open-source embedding model and searched by cosine similarity for every question, so the
 * language model answers from retrieved documentation instead of hardcoded branches.
 *
 * Everything runs locally: weights are downloaded once from the open Hugging Face repository and
 * cached by the browser; no key, no inference API, no server round-trip.
 */

import { KNOWLEDGE, type KnowledgeDoc } from '@/lib/assistant/knowledge'

export const EMBEDDING_MODEL = {
  id: 'Xenova/all-MiniLM-L6-v2',
  dtype: 'q8' as const,
  approxDownloadMB: 23,
  dimensions: 384,
}

export type RagState =
  | { state: 'idle' }
  | { state: 'loading'; progress: number; detail: string }
  | { state: 'ready'; documents: number }
  | { state: 'error'; error: string }

type Embedder = (inputs: string[], options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array | number[]; dims: number[] }>

let currentState: RagState = { state: 'idle' }
let indexPromise: Promise<void> | null = null
let vectors: Float32Array[] = []
let embedder: Embedder | null = null

export function ragState(): RagState {
  return currentState
}

type ProgressEvent = { status: string; progress?: number; file?: string; loaded?: number; total?: number }

export type RagProgress = (info: { progress: number; detail: string }) => void

function embedInput(doc: KnowledgeDoc) {
  return `${doc.title} (${doc.category}). ${doc.text}`
}

async function loadEmbedder(onProgress: RagProgress) {
  const transformers = await import('@huggingface/transformers')
  transformers.env.allowLocalModels = false
  transformers.env.useBrowserCache = true

  const device = (await pickDevice()) as 'webgpu' | 'wasm'
  return transformers.pipeline('feature-extraction', EMBEDDING_MODEL.id, {
    dtype: EMBEDDING_MODEL.dtype,
    device,
    progress_callback: (event: ProgressEvent) => {
      if (event.status === 'progress' && typeof event.progress === 'number') {
        onProgress({ progress: event.progress, detail: `Downloading retrieval model ${event.file || ''}` })
      } else if (event.status === 'init') {
        onProgress({ progress: 0, detail: `Preparing retrieval model (${device})` })
      }
    },
  })
}

export async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (globalThis as { navigator?: { gpu?: { requestAdapter(): Promise<unknown> } } }).navigator?.gpu
    if (gpu && (await gpu.requestAdapter())) return 'webgpu'
  } catch {
    // Fall through to WASM, which works everywhere.
  }
  return 'wasm'
}

/** Builds the embedding index once per session and keeps it in memory. */
export function ensureKnowledgeIndex(onProgress: RagProgress = () => {}): Promise<void> {
  if (!indexPromise) {
    indexPromise = (async () => {
      currentState = { state: 'loading', progress: 0, detail: 'Preparing retrieval model' }
      embedder = (await loadEmbedder(onProgress)) as unknown as Embedder
      onProgress({ progress: 100, detail: 'Embedding platform documentation' })
      const embedded = await embedder(KNOWLEDGE.map(embedInput), { pooling: 'mean', normalize: true })
      const tensor = embedded as { data: Float32Array | number[]; dims: number[] }
      const dims = tensor.dims[tensor.dims.length - 1] || EMBEDDING_MODEL.dimensions
      const flat = tensor.data as ArrayLike<number>
      vectors = []
      for (let doc = 0; doc < KNOWLEDGE.length; doc += 1) {
        vectors.push(Float32Array.from(Array.prototype.slice.call(flat, doc * dims, (doc + 1) * dims)))
      }
      currentState = { state: 'ready', documents: KNOWLEDGE.length }
    })().catch((error) => {
      indexPromise = null
      currentState = { state: 'error', error: error instanceof Error ? error.message : String(error) }
      throw error
    })
  }
  return indexPromise
}

export type RetrievedDoc = { doc: KnowledgeDoc; score: number }

function cosine(query: Float32Array, doc: Float32Array) {
  let sum = 0
  for (let i = 0; i < query.length; i += 1) sum += query[i] * doc[i]
  return sum
}

/** Cosine search over the embedded corpus. Vectors are normalized, so the dot product is the score. */
export async function searchKnowledge(query: string, topK = 3, onProgress: RagProgress = () => {}): Promise<RetrievedDoc[]> {
  await ensureKnowledgeIndex(onProgress)
  if (!embedder) throw new Error('The retrieval model is not ready.')
  const embedded = await embedder([query], { pooling: 'mean', normalize: true })
  const tensor = embedded as { data: Float32Array | number[] }
  const queryVector = Float32Array.from(tensor.data as ArrayLike<number>)
  return vectors
    .map((vector, index) => ({ doc: KNOWLEDGE[index], score: cosine(queryVector, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((result) => result.score > 0.12)
}

