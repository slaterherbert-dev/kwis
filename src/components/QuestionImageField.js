import React, { useEffect, useRef, useState } from 'react'
import { uploadQuestionImage, fileFromWebAddress } from '../lib/questionImages'
import './QuestionImage.css'

// The "Picture" part of the add/edit question form.
//   form       the question form values (image_url, image_alt, image_caption, …)
//   onChange   called with the fields to change
//   teacherId  the signed-in teacher's id (their folder in Storage)
//   onUploaded called with each new picture's address (so unused ones can be cleaned up)
//   onBusy     called with true/false while a picture is uploading
export default function QuestionImageField({ form, onChange, teacherId, onUploaded, onBusy }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const fileInput = useRef(null)

  // A picture dropped just outside the box would otherwise open in the browser tab
  // and lose the question being typed.
  useEffect(() => {
    const stop = e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
  }, [])

  function setBusyBoth(v) { setBusy(v); if (onBusy) onBusy(v) }

  async function addFile(file) {
    if (!file || busy) return
    setError('')
    setBusyBoth(true)
    try {
      const { url, width, height } = await uploadQuestionImage(file, teacherId)
      if (onUploaded) onUploaded(url)
      onChange({ image_url: url, image_width: width, image_height: height })
    } catch (e) {
      setError(e.message)
    }
    setBusyBoth(false)
  }

  function onPaste(e) {
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'))
    if (item) { e.preventDefault(); addFile(item.getAsFile()) }
    else setError('Nothing to paste. Copy a picture first (right-click a picture → Copy image), then click here and press Ctrl+V.')
  }

  async function onDrop(e) {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files && e.dataTransfer.files[0]
    if (file) { addFile(file); return }
    // A picture dragged from another browser tab arrives as a web address
    const link = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim()
    if (!/^https?:\/\//.test(link)) { setError('Couldn’t use that. Save the picture to your computer, then choose the file.'); return }
    setError('')
    setBusyBoth(true)
    try {
      const f = await fileFromWebAddress(link)
      setBusyBoth(false)
      await addFile(f)
    } catch (err) {
      setError(err.message)
      setBusyBoth(false)
    }
  }

  const dropProps = {
    onDragOver: e => { e.preventDefault(); setOver(true) },
    onDragLeave: () => setOver(false),
    onDrop,
  }

  const fileChooser = (
    <input ref={fileInput} type="file" accept="image/*" hidden
      onChange={e => { addFile(e.target.files && e.target.files[0]); e.target.value = '' }} />
  )

  return (
    <div className="form-group">
      <label>Picture (optional)</label>

      {!form.image_url ? (
        <div className={`qimg-drop ${over ? 'over' : ''}`} tabIndex={0} onPaste={onPaste} {...dropProps}
          aria-label="Add a picture: choose a file, drop one here, or click here and paste">
          <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current.click()}
            style={{ margin: '0 auto' }}>
            {busy ? 'Uploading…' : 'Choose a picture'}
          </button>
          <p className="qimg-drop-note">
            or drag one here, or click this box and press Ctrl+V to paste.<br />
            Maps, primary sources, cartoons. No photos of students or student work.
          </p>
          {fileChooser}
        </div>
      ) : (
        <>
          <div className="qimg-edit-preview" tabIndex={0} onPaste={onPaste} {...dropProps}
            aria-label="Current picture. Drop or paste a new picture here to replace it.">
            <img src={form.image_url} alt={form.image_alt || 'Current picture'} />
            <div className="qimg-edit-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current.click()}>
                {busy ? 'Uploading…' : 'Replace'}
              </button>
              <button type="button" className="btn btn-danger" disabled={busy}
                onClick={() => { setError(''); onChange({ image_url: null, image_width: null, image_height: null }) }}>
                Remove
              </button>
            </div>
            {fileChooser}
          </div>

          <label className="qimg-sublabel" htmlFor="qimg-caption">Source line, shown under the picture</label>
          <input id="qimg-caption" placeholder="e.g. Thomas Nast, Harper’s Weekly, 1871"
            value={form.image_caption || ''} onChange={e => onChange({ image_caption: e.target.value })} />
          <label className="qimg-sublabel" htmlFor="qimg-alt">Description for screen readers</label>
          <input id="qimg-alt" placeholder="e.g. Cartoon of a tiger attacking a woman labeled Republic"
            value={form.image_alt || ''} onChange={e => onChange({ image_alt: e.target.value })} />
        </>
      )}

      {error && <p className="qimg-error-text">⚠ {error}</p>}
    </div>
  )
}
