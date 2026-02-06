import { useCallback, useEffect, useMemo, useRef } from "react"
import { cn } from "../../lib/utils"

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 }
}

export function DotPattern({
  className,
  children,
  dotSize = 2,
  gap = 24,
  baseColor = "#808080",
  glowColor = "#06b6d4", // Matches your Cyan theme
  proximity = 130,
  glowIntensity = 1.6,
  waveSpeed = 0.5,
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const dotsRef = useRef([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const animationRef = useRef()
  const startTimeRef = useRef(Date.now())
  const lastMoveTimeRef = useRef(Date.now())

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor])
  const glowRgb = useMemo(() => hexToRgb(glowColor), [glowColor])

  const buildGrid = useCallback(() => {
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

    const cellSize = dotSize + gap
    const cols = Math.ceil(rect.width / cellSize) + 1
    const rows = Math.ceil(rect.height / cellSize) + 1

    const offsetX = (rect.width - (cols - 1) * cellSize) / 2
    const offsetY = (rect.height - (rows - 1) * cellSize) / 2

    const dots = []
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        dots.push({
          x: offsetX + col * cellSize,
          y: offsetY + row * cellSize,
          baseOpacity: 0.6 + Math.random() * 0.2, // Increased base visibility
        })
      }
    }
    dotsRef.current = dots
  }, [dotSize, gap])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    const { x: mx, y: my } = mouseRef.current
    const proxSq = proximity * proximity
    const time = (Date.now() - startTimeRef.current) * 0.001 * waveSpeed
    
    // Auto-hide glow after 2s of inactivity
    const timeSinceMove = Date.now() - lastMoveTimeRef.current
    // Stay at 100% for 1s, then fade out over the next 1s
    const interactionStrength = Math.max(0, Math.min(1, 1 - (timeSinceMove - 1000) / 1000))

    for (const dot of dotsRef.current) {
      const dx = dot.x - mx
      const dy = dot.y - my
      const distSq = dx * dx + dy * dy

      // Wave animation
      const wave = Math.sin(dot.x * 0.02 + dot.y * 0.02 + time) * 0.5 + 0.5
      const waveOpacity = dot.baseOpacity + wave * 0.15
      const waveScale = 1 + wave * 0.2

      let opacity = waveOpacity
      let scale = waveScale
      let r = baseRgb.r
      let g = baseRgb.g
      let b = baseRgb.b
      let glow = 0

      // Mouse proximity effect (weighted by interaction strength)
      if (distSq < proxSq && interactionStrength > 0) {
        const dist = Math.sqrt(distSq)
        const t = (1 - dist / proximity) * interactionStrength
        const easedT = t * t * (3 - 2 * t) // smoothstep

        // Interpolate color
        r = Math.round(baseRgb.r + (glowRgb.r - baseRgb.r) * easedT)
        g = Math.round(baseRgb.g + (glowRgb.g - baseRgb.g) * easedT)
        b = Math.round(baseRgb.b + (glowRgb.b - baseRgb.b) * easedT)

        opacity = Math.min(1, waveOpacity + easedT * 0.8)
        scale = waveScale + easedT * 1.1
        glow = easedT * glowIntensity
      }

      const radius = (dotSize / 2) * scale

      // Draw glow
      if (glow > 0) {
        const gradient = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, radius * 5)
        gradient.addColorStop(0, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${glow * 0.45})`)
        gradient.addColorStop(0.5, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${glow * 0.12})`)
        gradient.addColorStop(1, `rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, 0)`)
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, radius * 5, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      // Draw dot
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`
      ctx.fill()
    }

    animationRef.current = requestAnimationFrame(draw)
  }, [proximity, baseRgb, glowRgb, dotSize, glowIntensity, waveSpeed])

  useEffect(() => {
    buildGrid()

    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(buildGrid)
    ro.observe(container)

    return () => ro.disconnect()
  }, [buildGrid])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [draw])

  useEffect(() => {
    const handleMouseMove = (e) => {
      lastMoveTimeRef.current = Date.now()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const handleTouchMove = (e) => {
      lastMoveTimeRef.current = Date.now()
      if (e.touches.length > 0) {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        mouseRef.current = {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        }
      }
    }

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    // Attach to window so interaction works even if UI elements are on top
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mousedown", handleMouseMove)
    window.addEventListener("touchmove", handleTouchMove, { passive: true })
    window.addEventListener("touchstart", handleTouchMove, { passive: true })
    window.addEventListener("mouseleave", handleMouseLeave)
    window.addEventListener("touchend", handleMouseLeave)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mousedown", handleMouseMove)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchstart", handleTouchMove)
      window.removeEventListener("mouseleave", handleMouseLeave)
      window.removeEventListener("touchend", handleMouseLeave)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn("fixed inset-0 overflow-hidden bg-[#030014] -z-20", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-60" />

      {/* Vignette overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(3,0,20,0.8) 100%)",
        }}
      />

      {/* Content layer */}
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  )
}

export default DotPattern;
