// Redact the obvious personal-identifying shapes from free-text feedback before
// it is ever grouped, reported, or (optionally) sent to a model.
//
// This is a best-effort filter, not a guarantee. The pipeline is only for
// adult-authored, already-minimized feedback; do not feed it raw child data.

const URL_PATTERN = /https?:\/\/[^\s]+/g
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const HANDLE_PATTERN = /@[A-Za-z0-9_]{2,}/g
const INTL_PHONE_PATTERN = /\+\d[\d\s().-]{6,}\d/g
const PAREN_PHONE_PATTERN = /\(\d{2,4}\)[\d\s.-]{5,}\d/g
const BARE_LONG_NUMBER_PATTERN = /\b\d{7,}\b/g

export const sanitizeFeedback = (text) => {
  if (typeof text !== 'string') return ''
  return text
    .replace(URL_PATTERN, '[redacted-url]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(HANDLE_PATTERN, '[redacted-handle]')
    .replace(INTL_PHONE_PATTERN, '[redacted-number]')
    .replace(PAREN_PHONE_PATTERN, '[redacted-number]')
    .replace(BARE_LONG_NUMBER_PATTERN, '[redacted-number]')
    .replace(/\s+/g, ' ')
    .trim()
}
