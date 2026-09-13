/**
 * Pia's retrieval layer (the RAG in "Groq + RAG + tools").
 *
 * Stage 1 — lexical candidates: a BM25 index over the bundled PackSure knowledge corpus, built
 * once per server process.
 * Stage 2 — semantic selection: Groq itself reads the question plus the corpus index and chooses
 * the documents that actually match the meaning, which handles paraphrases BM25 cannot. If that
 * selection call fails for any reason, retrieval degrades gracefully to the BM25 top results, so
 * a model outage never removes grounding entirely.
 *
 * No embedding model, no ONNX runtime, no browser download: retrieval needs nothing but the
 * corpus and (preferably) the same Groq key the generator uses.
 */

import { KNOWLEDGE, type KnowledgeDoc } from '@/lib/assistant/knowledge'
import { groqChat, groqRetrievalModel, GroqError } from '@/lib/assistant/groq'

export type RetrievedDoc = { doc: KnowledgeDoc; score: number; via: 'semantic' | 'lexical' }

const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'about', 'into', 'over', 'after', 'before', 'and', 'or', 'not', 'no', 'yes', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here', 'what', 'which', 'who', 'whom', 'why', 'how', 'when', 'where', 'me', 'my', 'you', 'your', 'i', 'we', 'us', 'they', 'them', 'he', 'she', 'his', 'her', 'please', 'tell', 'explain', 'show', 'get', 'let'])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/[\s_]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

type IndexEntry = { doc: KnowledgeDoc; terms: Map<string, number>; length: number }

let index: { entries: IndexEntry[]; averageLength: number; documentFrequency: Map<string, number> } | null = null

function buildIndex() {
  if (index) return index
  const entries: IndexEntry[] = KNOWLEDGE.map((doc) => {
    const tokens = tokenize(`${doc.title} ${doc.title} ${doc.category} ${doc.text}`)
    const terms = new Map<string, number>()
    for (const token of tokens) terms.set(token, (terms.get(token) || 0) + 1)
    return { doc, terms, length: tokens.length }
  })
  const documentFrequency = new Map<string, number>()
  for (const entry of entries) {
    for (const term of entry.terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
  }
  const averageLength = entries.reduce((sum, entry) => sum + entry.length, 0) / Math.max(1, entries.length)
  index = { entries, averageLength, documentFrequency }
  return index
}

const K1 = 1.5
const B = 0.75

function bm25Scores(queryTerms: string[]): Map<string, number> {
  const { entries, averageLength, documentFrequency } = buildIndex()
  const scores = new Map<string, number>()
  const total = entries.length
  for (const term of new Set(queryTerms)) {
    const df = documentFrequency.get(term) || 0
    if (df === 0) continue
    const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5))
    for (const entry of entries) {
      const tf = entry.terms.get(term) || 0
      if (tf === 0) continue
      const score = idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * entry.length) / averageLength)))
      scores.set(entry.doc.id, (scores.get(entry.doc.id) || 0) + score)
    }
  }
  return scores
}

export function lexicalCandidates(query: string, limit = 6): RetrievedDoc[] {
  const scores = bm25Scores(tokenize(query))
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ doc: KNOWLEDGE.find((entry) => entry.id === id) as KnowledgeDoc, score: Math.round(score * 100) / 100, via: 'lexical' as const }))
    .filter((result) => result.score > 0.35)
}

const SELECTOR_SYSTEM = `You are PackSure's documentation retrieval selector.
You receive a user question and the PackSure knowledge index (id, category, title, one-line summary).
Choose the ids of the documents that would help answer the question's MEANING, including paraphrases and indirect phrasings.
Reply with strict JSON: {"ids": ["<id>", ...]} using at most 3 ids, most relevant first.
If nothing matches, reply {"ids": []}. Never invent ids.`

function corpusIndex() {
  return KNOWLEDGE.map((doc) => `id: ${doc.id} | ${doc.category} | ${doc.title} | ${doc.text.slice(0, 110)}`).join('\n')
}

/**
 * Semantic retrieval: Groq chooses the matching documents from the corpus index, informed by the
 * BM25 candidate scores. Falls back to the lexical candidates when the selector is unavailable.
 */
export async function retrieveKnowledge(query: string): Promise<{ docs: RetrievedDoc[]; selectorUsed: boolean }> {
  const candidates = lexicalCandidates(query)
  if (KNOWLEDGE.length === 0) return { docs: [], selectorUsed: false }

  try {
    const reply = await groqChat(
      [
        { role: 'system', content: SELECTOR_SYSTEM },
        {
          role: 'user',
          content: `Question: ${query}\n\nLexical hints (BM25): ${candidates.map((candidate) => candidate.doc.id).join(', ') || 'none'}\n\nKnowledge index:\n${corpusIndex()}`,
        },
      ],
      { model: groqRetrievalModel(), jsonObject: true, maxTokens: 120, temperature: 0 },
    )
    const parsed = JSON.parse(reply.content || '{}') as { ids?: unknown }
    const ids = Array.isArray(parsed.ids) ? (parsed.ids as unknown[]).filter((id): id is string => typeof id === 'string') : []
    const chosen = ids
      .map((id) => KNOWLEDGE.find((doc) => doc.id === id))
      .filter((doc): doc is KnowledgeDoc => Boolean(doc))
      .slice(0, 3)
    if (chosen.length > 0) {
      return { docs: chosen.map((doc) => ({ doc, score: 1, via: 'semantic' as const })), selectorUsed: true }
    }
    return { docs: candidates.slice(0, 3), selectorUsed: true }
  } catch (error) {
    // Retrieval must survive a selector outage (including a missing key): lexical grounding remains.
    if (error instanceof GroqError && error.kind === 'missing_key') throw error
    return { docs: candidates.slice(0, 3), selectorUsed: false }
  }
}
