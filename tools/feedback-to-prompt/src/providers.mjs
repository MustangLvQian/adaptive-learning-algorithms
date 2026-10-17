// Provider-agnostic model access. The pipeline only ever asks for a text
// completion of two messages, so any OpenAI-compatible chat endpoint works by
// pointing LLM_BASE_URL at it.

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_MODEL = 'gpt-4o-mini'

export const createProvider = (options = {}) => {
  const provider = options.provider ?? 'none'
  const apiKey = options.apiKey ?? process.env.LLM_API_KEY
  const baseUrl = options.baseUrl ?? process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL
  const model = options.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL

  if (provider === 'none') {
    throw new Error(
      'Live mode needs a provider. Pass --provider openai-compatible and set LLM_API_KEY.',
    )
  }
  if (provider !== 'openai-compatible' && provider !== 'openai') {
    throw new Error(`Unsupported provider: ${provider}`)
  }
  if (!apiKey) {
    throw new Error('Missing API key. Set LLM_API_KEY in the environment.')
  }

  return {
    name: provider,
    model,
    async complete({ system, user }) {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        },
      )
      if (!response.ok) {
        throw new Error(
          `Provider error ${response.status}: ${await response.text()}`,
        )
      }
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error('Provider response did not contain message content.')
      }
      return content
    },
  }
}
