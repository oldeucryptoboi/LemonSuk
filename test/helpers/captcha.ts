export function solveCaptchaPrompt(prompt: string): string {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9.\s]/g, '')
  const values = Array.from(prompt.matchAll(/-?\d+(?:\.\d+)?/g), (match) =>
    Number(match[0]),
  )

  if (values.length < 2) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  const [left, right] = values

  if (
    normalized.includes('finds') ||
    normalized.includes('more') ||
    normalized.includes('total')
  ) {
    return (left + right).toFixed(2)
  }

  if (
    normalized.includes('slows') ||
    normalized.includes('loses') ||
    normalized.includes('remain') ||
    normalized.includes('new speed')
  ) {
    return (left - right).toFixed(2)
  }

  if (
    normalized.includes('multiplies') ||
    normalized.includes('product')
  ) {
    return (left * right).toFixed(2)
  }

  if (
    normalized.includes('splits') ||
    normalized.includes('share')
  ) {
    return (left / right).toFixed(2)
  }

  throw new Error(`Could not solve captcha prompt: ${prompt}`)
}
