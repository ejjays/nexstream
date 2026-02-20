import React, { useCallback, useEffect, useRef, memo } from "react"
import { cn } from "../../lib/utils"

export const ShootingStars = memo(({
  className,
  minSpeed = 3,
  maxSpeed = 8,
  minDelay = 1000,
  maxDelay = 3000,
  starColor = "#06b6d4",
  starWidth = 20,
}) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const starsRef = useRef([])
  const animationRef = useRef()
  const timeoutRef = useRef()

  function createStar() {
    const container = containerRef.current
    if (!container || document.visibilityState !== 'visible') {
      const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
      timeoutRef.current = setTimeout(createStar, randomDelay)
      return
    }

    const { width, height } = container.getBoundingClientRect()
    
    let x, y;
    if (Math.random() > 0.5) {
      x = Math.random() * width;
      y = -50;
    } else {
      x = -50;
      y = Math.random() * height;
    }
    
    const angle = (45 + (Math.random() * 10 - 5)) * Math.PI / 180;

    const newStar = {
      id: Math.random(),
      x,
      y,
      angle,
      speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
      opacity: 0,
      life: 0,
      maxLife: 120 + Math.random() * 80,
      size: 1 + Math.random() * 0.5
    }

    starsRef.current.push(newStar)

    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
    timeoutRef.current = setTimeout(createStar, randomDelay)
  }

  function draw() {
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
      
      if (star.life < 15) star.opacity = star.life / 15
      else if (star.life > star.maxLife - 30) star.opacity = (star.maxLife - star.life) / 30
      else star.opacity = 1

      const { x, y, angle, speed, opacity, size } = star
      const length = starWidth * (2 + speed / 5)

      const gradient = ctx.createLinearGradient(
        x, y, 
        x - length * Math.cos(angle), 
        y - length * Math.sin(angle)
      )
      gradient.addColorStop(0, starColor)
      gradient.addColorStop(0.1, starColor)
      gradient.addColorStop(1, "transparent")

      ctx.save()
      ctx.globalAlpha = opacity
      ctx.beginPath()
      ctx.strokeStyle = gradient
      ctx.lineWidth = size
      ctx.lineCap = "butt"
      ctx.moveTo(x, y)
      ctx.lineTo(x - length * Math.cos(angle), y - length * Math.sin(angle))
      ctx.stroke()

      ctx.beginPath()
      ctx.fillStyle = starColor
      ctx.arc(x, y, size * 0.8, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.restore()

      const { width, height } = canvas.getBoundingClientRect()
      return (
        star.life < star.maxLife &&
        x > -200 && x < width + 200 &&
        y > -200 && y < height + 200
      )
    })

    animationRef.current = requestAnimationFrame(draw)
  }

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
  }, [minDelay, maxDelay, minSpeed, maxSpeed])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [starColor, starWidth])

  return (
    <div
      ref={containerRef}
      className={cn("fixed inset-0 overflow-hidden pointer-events-none -z-10", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
});

export default ShootingStars;
