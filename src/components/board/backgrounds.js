export const BACKGROUNDS = [
  { type: 'gradient', value: 'linear-gradient(160deg, #fde7c8 0%, #f6b98a 55%, #e9866b 100%)', label: 'Sunrise' },
  { type: 'gradient', value: 'linear-gradient(160deg, #cfe9f5 0%, #8cc6e0 50%, #3f8fb8 100%)', label: 'Sky' },
  { type: 'gradient', value: 'linear-gradient(160deg, #d8ecd0 0%, #8fbf86 50%, #4d7f4f 100%)', label: 'Meadow' },
  { type: 'gradient', value: 'linear-gradient(160deg, #2a2f5a 0%, #4a3a78 55%, #7a4b8c 100%)', label: 'Dusk' },
  { type: 'color', value: '#f6efe2', label: 'Paper' },
  { type: 'color', value: '#26392f', label: 'Chalkboard' },
  { type: 'color', value: '#2d3142', label: 'Slate' },
  { type: 'color', value: '#ffffff', label: 'White' },
]

export function bgStyle(bg) {
  if (!bg) return { background: BACKGROUNDS[0].value }
  if (bg.type === 'image') {
    return { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { background: bg.value }
}

// Shrinks a photo so it's quick to save and load (about 1920px wide, JPEG).
export function compressImage(file, maxWidth = 1920) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Couldn’t read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file isn’t an image Kwis can use. Try a JPG or PNG.'))
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
