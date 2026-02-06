import React, { useCallback, useEffect, useRef } from "react"
import { cn } from "../../lib/utils"

export function ShootingStars({
  className,
  minSpeed = 3,
  maxSpeed = 8,
  minDelay = 1000,
  maxDelay = 3000,
  starColor = "#06b6d4",
  trailColor = "rgba(6, 182, 212, 0.2)",
  starWidth = 20,
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const starsRef = useRef([])
  const animationRef = useRef()
  const timeoutRef = useRef()

  const createStar = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { width, height } = container.getBoundingClientRect()
    
    // Random side to spawn from
    const side = Math.floor(Math.random() * 4)
    let x, y, angle

    switch (side) {
      case 0: x = Math.random() * width; y = -20; angle = 45; break; // Top
      case 1: x = width + 20; y = Math.random() * height; angle = 135; break; // Right
      case 2: x = Math.random() * width; y = height + 20; angle = 225; break; // Bottom
      default: x = -20; y = Math.random() * height; angle = 315; break; // Left
    }

    const newStar = {
      id: Math.random(),
      x,
      y,
      angle: (angle * Math.PI) / 180,
      speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
      opacity: 0,
      life: 0,
      maxLife: 100 + Math.random() * 100,
      size: 1.5 + Math.random() * 1.5
    }

    starsRef.current.push(newStar)

    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
    timeoutRef.current = setTimeout(createStar, randomDelay)
  }, [minSpeed, maxSpeed, minDelay, maxDelay])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    starsRef.current = starsRef.current.filter(star => {
      star.x += star.speed * Math.cos(star.angle)
      star.y += star.speed * Math.sin(star.angle)
      star.life++
      
      // Smooth fade in and out
      if (star.life < 20) star.opacity = star.life / 20
      else if (star.life > star.maxLife - 20) star.opacity = (star.maxLife - star.life) / 20
      else star.opacity = 1

      const { x, y, angle, speed, opacity, size } = star
      const length = starWidth * (1 + speed / 10)

      // Draw Tapered Trail
      const gradient = ctx.createLinearGradient(
        x, y, 
        x - length * Math.cos(angle), 
        y - length * Math.sin(angle)
      )
      gradient.addColorStop(0, starColor)
      gradient.addColorStop(1, "transparent")

      ctx.save()
      ctx.globalAlpha = opacity
      ctx.beginPath()
      ctx.strokeStyle = gradient
      ctx.lineWidth = size
      ctx.lineCap = "round"
      ctx.moveTo(x, y)
      ctx.lineTo(x - length * Math.cos(angle), y - length * Math.sin(angle))
      ctx.stroke()

      // Draw Head Glow
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 5)
      glow.addColorStop(0, starColor)
      glow.addColorStop(0.4, starColor)
      glow.addColorStop(1, "transparent")
      ctx.fillStyle = glow
      ctx.globalAlpha = opacity * 0.6
      ctx.beginPath()
      ctx.arc(x, y, size * 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Keep if within bounds and alive
      const { width, height } = canvas.getBoundingClientRect()
      return (
        star.life < star.maxLife &&
        x > -200 && x < width + 200 &&
        y > -200 && y < height + 200
      )
    })

    animationRef.current = requestAnimationFrame(draw)
  }, [starColor, starWidth])

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.scale(dpr, dpr)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    createStar()

    return () => {
      window.removeEventListener("resize", handleResize)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [createStar])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [draw])

  return (
    <div
      ref={containerRef}
      className={cn("fixed inset-0 overflow-hidden pointer-events-none -z-10", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}

export default ShootingStars;