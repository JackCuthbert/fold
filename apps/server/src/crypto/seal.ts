const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

const toBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url')
const fromBase64Url = (text: string): Uint8Array =>
  new Uint8Array(Buffer.from(text, 'base64url'))

export async function seal(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`
}

export async function unseal(
  sealed: string,
  secret: string,
): Promise<string | null> {
  const [ivPart, dataPart] = sealed.split('.')
  if (!ivPart || !dataPart) return null
  try {
    const key = await deriveKey(secret)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
      key,
      fromBase64Url(dataPart),
    )
    return decoder.decode(plaintext)
  } catch {
    return null
  }
}
