// Text boxes can hold bold, italic, and underline. The formatted version is
// saved as a small, cleaned-up piece of HTML (titleHtml / bodyHtml). The plain
// text (title / body) is kept alongside it, so older boards still open fine.

const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN'])
const BLOCK = new Set(['DIV', 'P'])
// The only inline styles we keep (browsers sometimes use these to un-bold
// or un-underline part of a word)
const STYLE_OK = /^(font-weight|font-style|text-decoration|text-decoration-line)$/

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const textToHtml = text => escape(text || '').replace(/\n/g, '<br>')

function cleanNode(node, doc) {
  const out = doc.createDocumentFragment()
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) { out.appendChild(doc.createTextNode(child.data)); return }
    if (child.nodeType !== 1) return
    const tag = child.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE') return
    const inner = cleanNode(child, doc)
    if (!KEEP.has(tag)) { out.appendChild(inner); return } // unwrap anything else
    const el = doc.createElement(tag.toLowerCase())
    if (tag === 'SPAN') {
      const props = []
      for (let k = 0; k < child.style.length; k++) props.push(child.style.item(k))
      const style = props.filter(p => STYLE_OK.test(p))
        .map(p => `${p}: ${child.style.getPropertyValue(p)}`).join('; ')
      if (!style) { out.appendChild(inner); return }
      el.setAttribute('style', style)
    }
    el.appendChild(inner)
    out.appendChild(el)
  })
  return out
}

// Strip everything except the formatting we allow
export function cleanHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const box = doc.createElement('div')
  box.appendChild(cleanNode(doc.body, doc))
  return box.innerHTML
}

export function htmlToText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  let text = ''
  const walk = node => node.childNodes.forEach(child => {
    if (child.nodeType === 3) text += child.data
    else if (child.nodeType === 1) {
      if (child.tagName === 'BR') { text += '\n'; return }
      if (BLOCK.has(child.tagName) && text && !text.endsWith('\n')) text += '\n'
      walk(child)
    }
  })
  walk(doc.body)
  return text
}

// The formatted version if there is one, otherwise the old plain text
export const richValue = (props, key) =>
  props[`${key}Html`] != null ? props[`${key}Html`] : textToHtml(props[key])
