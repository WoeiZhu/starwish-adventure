import * as THREE from 'three'

function mix(color: string, toward: string, amount: number) {
  return `#${new THREE.Color(color).lerp(new THREE.Color(toward), amount).getHexString()}`
}

// No fonts or images: both expressions use only canvas paths.
export function createFaceTextures(eye: string, hair: string, girl: boolean) {
  const paint = (closed: boolean) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 768
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('A 2D canvas is required to draw the chibi face')
    const ink = '#49313e'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const x of [235, 789]) {
      const blush = ctx.createRadialGradient(x, 554, 3, x, 554, 68)
      blush.addColorStop(0, 'rgba(249, 132, 145, 0.48)')
      blush.addColorStop(0.58, 'rgba(249, 132, 145, 0.24)')
      blush.addColorStop(1, 'rgba(249, 132, 145, 0)')
      ctx.save()
      ctx.translate(x, 554)
      ctx.scale(1, 0.52)
      ctx.translate(-x, -554)
      ctx.fillStyle = blush
      ctx.fillRect(x - 70, 484, 140, 140)
      ctx.restore()
    }

    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(512 + side * 211, 400)
      ctx.scale(side * 1.08, 1.2)
      ctx.translate(0, -400)
      ctx.strokeStyle = mix(hair, ink, 0.65)
      ctx.lineWidth = 11
      ctx.beginPath()
      ctx.moveTo(-57, 221)
      ctx.quadraticCurveTo(0, 203, 63, 223)
      ctx.stroke()

      if (closed) {
        ctx.strokeStyle = ink
        ctx.lineWidth = 15
        ctx.beginPath()
        ctx.moveTo(-76, 382)
        ctx.quadraticCurveTo(0, 455, 81, 370)
        ctx.stroke()
        ctx.lineWidth = 8
        ctx.beginPath()
        ctx.moveTo(64, 390)
        ctx.lineTo(88, 381)
        ctx.stroke()
      } else {
        const eyeShape = new Path2D()
        eyeShape.moveTo(-85, 365)
        eyeShape.bezierCurveTo(-74, 285, 37, 267, 83, 335)
        eyeShape.bezierCurveTo(107, 400, 75, 509, 4, 514)
        eyeShape.bezierCurveTo(-60, 519, -88, 460, -85, 365)
        ctx.fillStyle = '#fff9f4'
        ctx.fill(eyeShape)
        ctx.save()
        ctx.clip(eyeShape)
        const iris = ctx.createLinearGradient(0, 302, 0, 510)
        iris.addColorStop(0, mix(eye, '#211d35', 0.75))
        iris.addColorStop(0.42, eye)
        iris.addColorStop(0.82, mix(eye, '#fff0aa', 0.38))
        iris.addColorStop(1, mix(eye, '#fff6c4', 0.65))
        ctx.fillStyle = iris
        ctx.beginPath()
        ctx.ellipse(6, 400, 69, 113, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = mix(eye, '#282136', 0.65)
        ctx.lineWidth = 5
        ctx.stroke()
        ctx.fillStyle = '#2c273d'
        ctx.beginPath()
        ctx.ellipse(6, 381, 29, 65, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 244, 201, 0.72)'
        ctx.lineWidth = 9
        ctx.beginPath()
        ctx.ellipse(6, 412, 46, 76, 0, 0.23 * Math.PI, 0.79 * Math.PI)
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        // Both eyes share the same lighting direction in canvas space.
        ctx.ellipse(-side * 23, 338, 23, 29, side * 0.25, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(side * 31, 447, 11, 14, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.strokeStyle = '#8b6064'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(-57, 491)
        ctx.quadraticCurveTo(2, 531, 62, 489)
        ctx.stroke()
        ctx.strokeStyle = ink
        ctx.lineWidth = 17
        ctx.beginPath()
        ctx.moveTo(-85, 365)
        ctx.bezierCurveTo(-74, 285, 37, 267, 83, 335)
        ctx.stroke()
        ctx.lineWidth = girl ? 12 : 9
        ctx.beginPath()
        ctx.moveTo(67, 316)
        ctx.quadraticCurveTo(89, 323, 99, 304)
        if (girl) {
          ctx.moveTo(77, 330)
          ctx.quadraticCurveTo(101, 338, 108, 326)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.strokeStyle = 'rgba(183, 104, 96, 0.52)'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(510, 525)
    ctx.quadraticCurveTo(521, 534, 512, 537)
    ctx.stroke()
    ctx.strokeStyle = '#a45d68'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(479, 592)
    ctx.quadraticCurveTo(512, 627, 545, 592)
    ctx.stroke()

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    texture.name = closed ? 'Chibi face: blink' : 'Chibi face: open'
    return texture
  }

  return { open: paint(false), closed: paint(true) }
}
