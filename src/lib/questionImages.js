import { supabase } from '../supabase'

// Pictures on questions live in the Supabase Storage bucket "question-images",
// in a folder named with the teacher's user id: <teacherId>/<random>.webp
// The questions table stores the public address in image_url.

export const BUCKET = 'question-images'

// Picture questions get extra time to look at the map or cartoon.
// Host and student screens both use this, so their timers always match.
export const IMAGE_BONUS_SECONDS = 10
export function secondsFor(q, baseSeconds) {
  return q && q.image_url ? baseSeconds + IMAGE_BONUS_SECONDS : baseSeconds
}

const MAX_SIDE = 1600              // longest side in pixels after shrinking
const KEEP_AS_IS_BYTES = 300 * 1024 // small files are uploaded untouched
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const KEEP_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

const SETUP_MESSAGE = 'Pictures need a quick database update. Run kwis-question-images-setup.sql in Supabase (SQL Editor → New query → Run), then try again.'

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file isn’t a picture Kwis can use. Try a JPG or PNG.'))
    img.src = src
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

function randomName() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

// Shrinks a picture so it loads quickly on school Wi-Fi.
// Transparent areas become white (otherwise they would turn black).
export async function prepareImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('That isn’t a picture. Try a JPG, PNG, or GIF.')
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImg(objectUrl)
    const width = img.naturalWidth
    const height = img.naturalHeight
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))

    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES && KEEP_TYPES.includes(file.type)) {
      return { blob: file, type: file.type, ext: EXT[file.type], width, height }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // WebP is smallest. Some browsers can't make WebP, so fall back to JPEG.
    let blob = await canvasToBlob(canvas, 'image/webp', 0.85)
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.85)
    if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await canvasToBlob(canvas, 'image/jpeg', 0.7)
    if (!blob) throw new Error('Couldn’t prepare that picture. Try saving it as a JPG first.')

    return { blob, type: blob.type, ext: EXT[blob.type] || 'jpg', width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function friendlyStorageError(error) {
  const msg = (error && error.message) || ''
  if (/bucket not found|row-level security|violates|unauthorized|not allowed/i.test(msg)) return SETUP_MESSAGE
  if (/maximum allowed size|too large|payload/i.test(msg)) return 'That picture is too big, even after shrinking. Try a smaller one.'
  if (/mime|content type/i.test(msg)) return 'Kwis can use JPG, PNG, WebP, or GIF pictures.'
  return 'The picture didn’t upload. Check your connection and try again.'
}

async function uploadBlob(teacherId, blob, type, ext) {
  const path = `${teacherId}/${randomName()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: type,
    cacheControl: '31536000', // file names are never reused, so browsers can keep them for a year
    upsert: false,
  })
  if (error) throw new Error(friendlyStorageError(error))
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Shrinks and uploads a picture. Returns { url, width, height }.
export async function uploadQuestionImage(file, teacherId) {
  const p = await prepareImage(file)
  const url = await uploadBlob(teacherId, p.blob, p.type, p.ext)
  return { url, width: p.width, height: p.height }
}

// Turns a picture dragged in from another browser tab into a file.
// Works for sites that allow it (Wikimedia Commons, Library of Congress, …).
export async function fileFromWebAddress(url) {
  let res
  try { res = await fetch(url, { mode: 'cors' }) } catch (e) { res = null }
  if (!res || !res.ok) throw new Error('That website won’t share the picture directly. Save it to your computer, then choose the file.')
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('That link isn’t a picture. Save the picture to your computer, then choose the file.')
  return new File([blob], 'picture', { type: blob.type })
}

// Folder path inside the bucket, or null if the address isn't one of Kwis's pictures.
export function pathFromUrl(url) {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

// Deletes picture files that no question uses any more.
// Only touches the teacher's own folder. Never throws: cleanup is best effort.
export async function deleteImagesIfUnused(urls, teacherId) {
  try {
    const unique = [...new Set((urls || []).filter(Boolean))]
    const paths = []
    for (const url of unique) {
      const path = pathFromUrl(url)
      if (!path || !path.startsWith(`${teacherId}/`)) continue
      const { data, error } = await supabase.from('questions').select('id').eq('image_url', url).limit(1)
      if (error || (data && data.length > 0)) continue
      paths.push(path)
    }
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
  } catch (e) {
    // ignore
  }
}

// When importing another teacher's set, give the importer their own copy of each
// picture, so the copy keeps working even if the original teacher deletes theirs.
// If copying fails, the original address is kept (it still works for now).
export async function copyImageToMyFolder(url, teacherId) {
  const path = pathFromUrl(url)
  if (!path || path.startsWith(`${teacherId}/`)) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const blob = await res.blob()
    const type = KEEP_TYPES.includes(blob.type) ? blob.type : 'image/jpeg'
    return await uploadBlob(teacherId, blob, type, EXT[type])
  } catch (e) {
    return url
  }
}

// Starts downloading a picture in the background so it's ready when the question appears.
const preloaded = new Set()
export function preloadImage(url) {
  if (!url || preloaded.has(url)) return
  preloaded.add(url)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}
