/** Resize an image file to a JPEG data URL (keeps the database and backups small). */
export async function fileToDataUrl(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    return drawToJpeg(img, img.naturalWidth, img.naturalHeight, maxSide, quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function drawToJpeg(source: CanvasImageSource, w: number, h: number, maxSide = 1600, quality = 0.82): string {
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
