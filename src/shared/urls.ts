/** Only open absolute HTTPS URLs without embedded credentials in a browser. */
export function httpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password) return url
  } catch { /* An invalid address cannot be opened. */ }
}
