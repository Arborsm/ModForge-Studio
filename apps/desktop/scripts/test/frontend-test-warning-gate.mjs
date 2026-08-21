const REACT_ACT_WARNING_START = 'An update to'
const REACT_ACT_WARNING_END = 'inside a test was not wrapped in act(...).'
const RETAINED_TAIL_LENGTH = REACT_ACT_WARNING_START.length + REACT_ACT_WARNING_END.length + 256

export function createReactActWarningDetector() {
  let bufferedTail = ''
  let detected = false

  return {
    write(chunk) {
      const next = `${bufferedTail}${String(chunk)}`
      let startIndex = next.indexOf(REACT_ACT_WARNING_START)
      while (!detected && startIndex >= 0) {
        detected = next.indexOf(REACT_ACT_WARNING_END, startIndex + REACT_ACT_WARNING_START.length) >= 0
        startIndex = next.indexOf(REACT_ACT_WARNING_START, startIndex + REACT_ACT_WARNING_START.length)
      }
      bufferedTail = next.slice(-RETAINED_TAIL_LENGTH)
    },
    hasWarning() {
      return detected
    },
  }
}
