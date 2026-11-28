import { useState, useEffect, useMemo, useRef } from "react"
import {
    checkSavedTrack,
    getPlayerState,
    getQueue,
    getRecentlyPlayedTrack,
    getUserLibrary,
    jumpToQueueTrack,
    playLibraryItem,
    playPause,
    seekToPosition,
    setSavedTrack,
    setShuffle,
    setRepeatMode,
    skipToNext,
    skipToPrevious,
    type LibraryItemType,
    type SpotifyLibraryItem,
} from "../utils/spotify"
import {
    FaSpotify,
    FaShuffle,
    FaForwardStep,
    FaBackwardStep,
    FaPause,
    FaPlay,
    FaRepeat,
    FaListUl,
    FaXmark,
    FaHeart,
    FaRegHeart,
} from "react-icons/fa6"
import { AnimatePresence, motion } from "framer-motion"
import { getReadableTextColor, applyOpacity } from "~/utils/colorUtils"
import {
    getValidSpotifyAccessToken,
    handleSpotifyCallback,
    logoutSpotify,
    startSpotifyLogin,
} from "../utils/spotifyAuth"
import { useToaster } from "./Toaster"
import { Vibrant } from "node-vibrant/browser"
import { oklch, formatRgb } from "culori"
import type { Oklch } from "culori"

interface Track {
    id?: string
    uri?: string
    title: string
    artist: string
    album: string
    coverUrl: string
    duration: number
    progress: number
}
interface QueueTrack {
    uri?: string
    title: string
    artist: string
    album: string
    coverUrl: string
}
function LiquidWaveOverlay({
    color,
    isPlaying,
    widthPercent,
}: {
    color: string
    isPlaying: boolean
    widthPercent: number
}) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const path1Ref = useRef<SVGPathElement | null>(null)
    const path2Ref = useRef<SVGPathElement | null>(null)
    const ampRef = useRef(isPlaying ? 1 : 0)
    const isPlayingRef = useRef(isPlaying)
    isPlayingRef.current = isPlaying

    useEffect(() => {
        let rafId = 0
        let lastTs = performance.now()
        let phase = 0

        const H = 26

        // 5차 스무스스텝: 양끝 기울기(1차)와 곡률(2차) 모두 0으로 수렴해 꺾임 없이 유선형 접합
        const smootherstep = (edge0: number, edge1: number, x: number) => {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
            return t * t * t * (t * (t * 6 - 15) + 10)
        }

        const buildPath = (
            widthPx: number,
            wavelengthPx: number,
            phaseOffset: number,
            speed: number,
            heightScale: number,
            t: number,
            amp: number
        ) => {
            const steps = Math.max(64, Math.min(160, Math.round(widthPx / 4)))
            const fadePx = Math.min(96, widthPx * 0.28)
            const k = (Math.PI * 2) / wavelengthPx
            const pts: [number, number][] = []

            for (let i = 0; i <= steps; i++) {
                const u = i / steps
                const xPx = u * widthPx
                const xView = u * 400
                const edgeFade =
                    smootherstep(0, fadePx, xPx) * smootherstep(0, fadePx, widthPx - xPx)
                const primary = 0.5 + 0.5 * Math.sin(xPx * k - t * speed + phaseOffset)
                const secondary =
                    0.5 + 0.5 * Math.sin(xPx * (k * 0.53) - t * (speed * 0.65) + phaseOffset * 1.7)
                const h = (0.28 + 0.52 * primary + 0.2 * secondary) * heightScale
                const y = H - edgeFade * h * (H - 2) * amp
                pts.push([xView, y])
            }

            let d = `M 0 ${H + 1} L ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i][0] + pts[i + 1][0]) / 2
                const midY = (pts[i][1] + pts[i + 1][1]) / 2
                d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
            }
            const last = pts[pts.length - 1]
            d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)} L 400 ${H + 1} Z`
            return d
        }

        const loop = (now: number) => {
            const dt = Math.min((now - lastTs) / 1000, 0.05)
            lastTs = now

            const targetAmp = isPlayingRef.current ? 1 : 0
            ampRef.current += (targetAmp - ampRef.current) * Math.min(1, dt * 4)

            const widthPx = svgRef.current?.clientWidth ?? 0
            const widthGain = smootherstep(18, 120, widthPx)
            const effectiveAmp = ampRef.current * widthGain

            if (effectiveAmp > 0.004 && widthPx > 18) {
                phase += dt * 0.9
                if (path1Ref.current) {
                    path1Ref.current.setAttribute(
                        "d",
                        buildPath(widthPx, 175, 0, 1.35, 0.95, phase, effectiveAmp)
                    )
                }
                if (path2Ref.current) {
                    path2Ref.current.setAttribute(
                        "d",
                        buildPath(widthPx, 220, Math.PI, 0.95, 0.88, phase, effectiveAmp)
                    )
                }
            } else {
                const flat = `M 0 ${H + 2} L 400 ${H + 2} Z`
                if (path1Ref.current) path1Ref.current.setAttribute("d", flat)
                if (path2Ref.current) path2Ref.current.setAttribute("d", flat)
            }

            rafId = requestAnimationFrame(loop)
        }

        rafId = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(rafId)
    }, [])

    if (widthPercent <= 0.5) return null

    return (
        <svg
            ref={svgRef}
            viewBox="0 0 400 27"
            preserveAspectRatio="none"
            className="absolute left-[5px] bottom-[calc(50%+4px)] pointer-events-none overflow-visible"
            style={{
                width: `max(0px, calc(${widthPercent}% - 5px))`,
                height: "16px",
            }}
        >
            <path ref={path2Ref} fill={color} fillOpacity={0.42} />
            <path ref={path1Ref} fill={color} fillOpacity={0.84} />
        </svg>
    )
}

const SPOTIFY_PLAYER_CACHE_KEY = "dashboard.spotify.player.cache.v1"

type SpotifyPlayerCache = {
    accessToken: string | null
    currentTrack: Track | null
    recentTrack: Track | null
    queue: QueueTrack[]
    deviceName: string
    contextUri: string | null
    isPlaying: boolean
    progressBaseMs: number
    progressSyncAt: number
    isSaved: boolean
    savedTrackId: string | null
    shuffleOn: boolean
    repeatMode: "off" | "track" | "context"
    accentColor: string
    showPlaylist: boolean
}

let memorySpotifyCache: SpotifyPlayerCache | null = null

function loadSpotifyPlayerCache(): SpotifyPlayerCache {
    if (memorySpotifyCache) return memorySpotifyCache
    if (typeof window !== "undefined") {
        try {
            const raw = localStorage.getItem(SPOTIFY_PLAYER_CACHE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<SpotifyPlayerCache>
                const cache: SpotifyPlayerCache = {
                    accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
                    currentTrack: parsed.currentTrack ?? null,
                    recentTrack: parsed.recentTrack ?? null,
                    queue: Array.isArray(parsed.queue) ? parsed.queue : [],
                    deviceName:
                        typeof parsed.deviceName === "string" ? parsed.deviceName : "Device",
                    contextUri: typeof parsed.contextUri === "string" ? parsed.contextUri : null,
                    isPlaying: Boolean(parsed.isPlaying),
                    progressBaseMs:
                        typeof parsed.progressBaseMs === "number" ? parsed.progressBaseMs : 0,
                    progressSyncAt:
                        typeof parsed.progressSyncAt === "number" ? parsed.progressSyncAt : 0,
                    isSaved: Boolean(parsed.isSaved),
                    savedTrackId:
                        typeof parsed.savedTrackId === "string" ? parsed.savedTrackId : null,
                    shuffleOn: Boolean(parsed.shuffleOn),
                    repeatMode:
                        parsed.repeatMode === "track" || parsed.repeatMode === "context"
                            ? parsed.repeatMode
                            : "off",
                    accentColor:
                        typeof parsed.accentColor === "string" ? parsed.accentColor : "#838383",
                    showPlaylist:
                        typeof parsed.showPlaylist === "boolean" ? parsed.showPlaylist : true,
                }
                memorySpotifyCache = cache
                return cache
            }
        } catch {
            // ignore storage errors
        }
    }
    return {
        accessToken: null,
        currentTrack: null,
        recentTrack: null,
        queue: [],
        deviceName: "Device",
        contextUri: null,
        isPlaying: false,
        progressBaseMs: 0,
        progressSyncAt: 0,
        isSaved: false,
        savedTrackId: null,
        shuffleOn: false,
        repeatMode: "off",
        accentColor: "#838383",
        showPlaylist: true,
    }
}

function saveSpotifyPlayerCache(patch: Partial<SpotifyPlayerCache>) {
    const next: SpotifyPlayerCache = { ...loadSpotifyPlayerCache(), ...patch }
    memorySpotifyCache = next
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(SPOTIFY_PLAYER_CACHE_KEY, JSON.stringify(next))
    } catch {
        // ignore storage errors
    }
}

function MarqueeText({ text, className = "" }: { text: string; className?: string }) {
    const [marqueeOn, setMarqueeOn] = useState(false)
    const wrapRef = useRef<HTMLDivElement | null>(null)
    const measureRef = useRef<HTMLDivElement | null>(null)
    const innerRef = useRef<HTMLDivElement | null>(null)
    const offsetRef = useRef(0)
    const lastTsRef = useRef<number | null>(null)
    const pauseUntilRef = useRef<number | null>(null)

    useEffect(() => {
        if (!text) {
            setMarqueeOn(false)
            return
        }
        let raf1 = 0
        let raf2 = 0
        const measure = () => {
            const wrap = wrapRef.current
            const el = measureRef.current
            if (!wrap || !el) return
            const wrapW = wrap.getBoundingClientRect().width
            const textW = el.getBoundingClientRect().width
            if (wrapW <= 0) return
            const should = textW > wrapW
            setMarqueeOn((prev) => (prev === should ? prev : should))
        }
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(measure)
        })
        const tAfterTransition = window.setTimeout(measure, 340)
        const ro = new ResizeObserver(() => measure())
        if (wrapRef.current) ro.observe(wrapRef.current)
        if (measureRef.current) ro.observe(measureRef.current)
        return () => {
            cancelAnimationFrame(raf1)
            cancelAnimationFrame(raf2)
            window.clearTimeout(tAfterTransition)
            ro.disconnect()
        }
    }, [text, className, marqueeOn])

    useEffect(() => {
        const inner = innerRef.current
        if (!inner) return
        const prefersReduced =
            typeof window !== "undefined" &&
            "matchMedia" in window &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (prefersReduced || !marqueeOn) {
            offsetRef.current = 0
            lastTsRef.current = null
            pauseUntilRef.current = null
            inner.style.transform = "translateX(0px)"
            return
        }
        const SPEED_PX_PER_SEC = 28
        const PAUSE_MS = 2000
        offsetRef.current = 0
        lastTsRef.current = null
        pauseUntilRef.current = performance.now() + PAUSE_MS
        inner.style.transform = "translateX(0px)"
        let dir: 1 | -1 = 1
        let raf = 0
        const tick = (ts: number) => {
            const innerEl = innerRef.current
            const wrapEl = wrapRef.current
            const textEl = measureRef.current
            if (!innerEl || !wrapEl || !textEl) return

            const maxOffset = Math.max(
                0,
                textEl.getBoundingClientRect().width - wrapEl.getBoundingClientRect().width
            )
            if (!Number.isFinite(maxOffset) || maxOffset <= 0) {
                offsetRef.current = 0
                innerEl.style.transform = "translateX(0px)"
                raf = requestAnimationFrame(tick)
                return
            }

            const last = lastTsRef.current ?? ts
            lastTsRef.current = ts
            const pauseUntil = pauseUntilRef.current
            if (typeof pauseUntil === "number" && ts < pauseUntil) {
                raf = requestAnimationFrame(tick)
                return
            }

            const dtMs = Math.min(50, Math.max(0, ts - last))
            const deltaPx = (dtMs / 1000) * SPEED_PX_PER_SEC * dir
            let next = offsetRef.current + deltaPx

            if (dir === 1 && next >= maxOffset) {
                next = maxOffset
                dir = -1
                pauseUntilRef.current = ts + PAUSE_MS
            } else if (dir === -1 && next <= 0) {
                next = 0
                dir = 1
                pauseUntilRef.current = ts + PAUSE_MS
            }

            offsetRef.current = next
            innerEl.style.transform = `translateX(${-next.toFixed(2)}px)`
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [marqueeOn, text])

    return (
        <div ref={wrapRef} className={`relative overflow-hidden whitespace-nowrap ${className}`}>
            <span
                ref={measureRef}
                aria-hidden="true"
                className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap"
            >
                {text}
            </span>
            {marqueeOn ? (
                <div
                    ref={innerRef}
                    className="inline-block whitespace-nowrap will-change-transform"
                >
                    {text}
                </div>
            ) : (
                <div className="whitespace-nowrap">{text}</div>
            )}
        </div>
    )
}

export function MusicPlayer() {
    const [isPlaying, setIsPlaying] = useState(() => loadSpotifyPlayerCache().isPlaying)
    const [currentTrack, setCurrentTrack] = useState<Track | null>(
        () => loadSpotifyPlayerCache().currentTrack
    )
    const [accessToken, setAccessToken] = useState<string | null>(
        () => loadSpotifyPlayerCache().accessToken
    )
    const [deviceName, setDeviceName] = useState(() => loadSpotifyPlayerCache().deviceName)
    const [queue, setQueue] = useState<QueueTrack[]>(() => loadSpotifyPlayerCache().queue)
    const { pushToast } = useToaster()
    const [shuffleOn, setShuffleOn] = useState(() => loadSpotifyPlayerCache().shuffleOn)
    const [repeatMode, setRepeatModeState] = useState<"off" | "track" | "context">(
        () => loadSpotifyPlayerCache().repeatMode
    )
    const [recentTrack, setRecentTrack] = useState<Track | null>(
        () => loadSpotifyPlayerCache().recentTrack
    )
    const [accentColor, setAccentColor] = useState<string>(
        () => loadSpotifyPlayerCache().accentColor
    )
    // 시간 보정
    const [progressBaseMs, setProgressBaseMs] = useState(
        () => loadSpotifyPlayerCache().progressBaseMs
    )
    const [progressSyncAt, setProgressSyncAt] = useState(
        () => loadSpotifyPlayerCache().progressSyncAt
    )
    const [displayProgressMs, setDisplayProgressMs] = useState(() => {
        const c = loadSpotifyPlayerCache()
        if (!c.currentTrack) return 0
        if (!c.isPlaying || !c.progressSyncAt) return c.progressBaseMs
        return Math.min(
            c.currentTrack.duration,
            Math.max(0, Math.floor(c.progressBaseMs + (Date.now() - c.progressSyncAt)))
        )
    })
    const [isSeeking, setIsSeeking] = useState(false)
    const [isSaved, setIsSaved] = useState(() => {
        const c = loadSpotifyPlayerCache()
        return Boolean(c.currentTrack?.id && c.savedTrackId === c.currentTrack.id && c.isSaved)
    })
    const [heartBurstId, setHeartBurstId] = useState(0)
    const [playlistTab, setPlaylistTab] = useState<"playlist" | "library">("playlist")
    const [libraryFilter, setLibraryFilter] = useState<"all" | LibraryItemType>("all")
    const [libraryItems, setLibraryItems] = useState<SpotifyLibraryItem[]>([])
    const [libraryNeedsRelogin, setLibraryNeedsRelogin] = useState(false)
    const [showPlaylist, setShowPlaylist] = useState(() => loadSpotifyPlayerCache().showPlaylist)
    useEffect(() => {
        saveSpotifyPlayerCache({ showPlaylist })
    }, [showPlaylist])
    const progressBaseRef = useRef(0)
    const progressSyncAtRef = useRef(0)
    const displayProgressRef = useRef(0)
    const isPlayingRef = useRef(false)
    const lastTrackIdRef = useRef<string | undefined>(undefined)
    const contextUriRef = useRef<string | null>(
        typeof window !== "undefined" ? loadSpotifyPlayerCache().contextUri : null
    )
    const seekCommittedPosRef = useRef<number | null>(null)
    const seekStartXRef = useRef<number | null>(null)
    const seekStartYRef = useRef<number | null>(null)
    const seekStartTimeRef = useRef<number | null>(null)
    const seekGestureLockRef = useRef<"undecided" | "horizontal" | "vertical">("undecided")
    const ambientBgRef = useRef<HTMLDivElement | null>(null)
    const ambientSeedRef = useRef<number>(1)
    const currentTrackMetaRef = useRef<{ duration: number; titleLen: number; artistLen: number }>({
        duration: 0,
        titleLen: 0,
        artistLen: 1,
    })
    const playlistScrollRef = useRef<HTMLDivElement | null>(null)
    const isDraggingPlaylistRef = useRef(false)
    const playlistStartYRef = useRef(0)
    const playlistScrollTopRef = useRef(0)
    const hasDraggedPlaylistRef = useRef(false)
    useEffect(() => {
        if (!currentTrack) return
        const seed = Math.max(
            1,
            Math.floor(currentTrack.duration) * Math.max(1, currentTrack.title.length)
        )
        ambientSeedRef.current = seed
        currentTrackMetaRef.current = {
            duration: currentTrack.duration,
            titleLen: currentTrack.title.length,
            artistLen: Math.max(1, currentTrack.artist.length),
        }
    }, [currentTrack?.id, currentTrack?.duration, currentTrack?.title])
    useEffect(() => {
        const prefersReduced =
            typeof window !== "undefined" &&
            "matchMedia" in window &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (prefersReduced) return

        const seededRand = (s: number) => {
            let x = Math.sin(s) * 43758.5453123
            return x - Math.floor(x)
        }

        let raf = 0
        let lastTs = performance.now()
        let appliedSeed = -1
        let t = 0
        let px = 0
        let py = 0
        let heading = 0
        let turnRate = 0
        let targetTurn = (Math.random() - 0.5) * 0.55
        let nextTurnAt = 0
        let nextTrailAt = 0
        const trail: Array<{ x: number; y: number }> = []
        const SPEED_PX = 52 // px per sec (일정한 속력)
        const SCALE = 1.45

        const tick = (ts: number) => {
            const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000))
            lastTs = ts

            const el = ambientBgRef.current
            const parent = el?.parentElement
            if (el && parent) {
                const vw = parent.clientWidth || 1
                const vh = parent.clientHeight || 1
                const baseSize = Math.max(vw, vh)
                const scaledSize = baseSize * SCALE

                el.style.width = `${baseSize}px`
                el.style.height = `${baseSize}px`

                const maxX = Math.max(20, (scaledSize - vw) / 2 - 24)
                const maxY = Math.max(20, (scaledSize - vh) / 2 - 24)

                // 곡 변경 시 노래 길이 * 제목 길이 시드로 결정론적 시작 위치/방향 초기화
                if (appliedSeed !== ambientSeedRef.current) {
                    appliedSeed = ambientSeedRef.current
                    const r1 = seededRand(appliedSeed)
                    const r2 = seededRand(appliedSeed + 17)
                    const r3 = seededRand(currentTrackMetaRef.current.artistLen)
                    const r4 = seededRand(appliedSeed + 97)
                    px = (r1 * 2 - 1) * maxX * 0.75
                    py = (r2 * 2 - 1) * maxY * 0.75
                    heading = r3 * Math.PI * 2
                    t = r4 * 100
                    trail.length = 0
                    nextTrailAt = t + 0.6
                    nextTurnAt = t + 1.5
                }

                if (isPlayingRef.current) {
                    t += dt
                    if (t >= nextTrailAt) {
                        trail.push({ x: px, y: py })
                        if (trail.length > 18) trail.shift()
                        nextTrailAt = t + 0.6
                    }

                    if (t >= nextTurnAt) {
                        targetTurn = (Math.random() - 0.5) * 0.55
                        nextTurnAt = t + 1.8 + Math.random() * 2.4
                    }
                    turnRate += (targetTurn - turnRate) * Math.min(1, 1.8 * dt)
                    heading += turnRate * dt

                    // 최근 지나온 궤적(직전 3개 제외)과 가까워지면 해당 방향을 피해 조향
                    const lookX = px + Math.cos(heading) * 65
                    const lookY = py + Math.sin(heading) * 65
                    const avoidCount = Math.max(0, trail.length - 3)
                    let avoidX = 0
                    let avoidY = 0
                    for (let i = 0; i < avoidCount; i++) {
                        const dx = lookX - trail[i].x
                        const dy = lookY - trail[i].y
                        const d = Math.hypot(dx, dy)
                        if (d > 1 && d < 110) {
                            const w = (110 - d) / 110
                            avoidX += (dx / d) * w
                            avoidY += (dy / d) * w
                        }
                    }
                    if (avoidX !== 0 || avoidY !== 0) {
                        const awayAngle = Math.atan2(avoidY, avoidX)
                        let diff = awayAngle - heading
                        while (diff > Math.PI) diff -= Math.PI * 2
                        while (diff < -Math.PI) diff += Math.PI * 2
                        heading += diff * Math.min(1, 1.8 * dt)
                    }

                    const rx = Math.abs(px) / maxX
                    const ry = Math.abs(py) / maxY
                    const edgeRatio = Math.max(rx, ry)
                    if (edgeRatio > 0.72) {
                        const targetAngle = Math.atan2(-py / maxY, -px / maxX)
                        let diff = targetAngle - heading
                        while (diff > Math.PI) diff -= Math.PI * 2
                        while (diff < -Math.PI) diff += Math.PI * 2
                        const turnStrength = ((edgeRatio - 0.72) / 0.28) * 2.6
                        heading += diff * Math.min(1, turnStrength * dt)
                    }

                    px += Math.cos(heading) * SPEED_PX * dt
                    py += Math.sin(heading) * SPEED_PX * dt

                    px = Math.max(-maxX, Math.min(maxX, px))
                    py = Math.max(-maxY, Math.min(maxY, py))
                }

                const rot = 6 * Math.sin(t * 0.14)
                el.style.transform = `translate3d(calc(-50% + ${px.toFixed(2)}px), calc(-50% + ${py.toFixed(2)}px), 0) scale(${SCALE}) rotate(${rot.toFixed(2)}deg)`
            }
            raf = requestAnimationFrame(tick)
        }

        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [])
    useEffect(() => {
        progressBaseRef.current = progressBaseMs
    }, [progressBaseMs])
    useEffect(() => {
        progressSyncAtRef.current = progressSyncAt
    }, [progressSyncAt])
    useEffect(() => {
        displayProgressRef.current = displayProgressMs
    }, [displayProgressMs])
    useEffect(() => {
        isPlayingRef.current = isPlaying
    }, [isPlaying])
    useEffect(() => {
        let mounted = true
        let intervalId: number | null = null
        const init = async () => {
            try {
                await handleSpotifyCallback().catch((e) => {
                    pushToast(e instanceof Error ? e.message : String(e), {
                        kind: "error",
                    })
                })
                const envToken = import.meta.env.VITE_SPOTIFY_ACCESS_TOKEN
                const token = (await getValidSpotifyAccessToken()) || envToken
                if (!mounted) return
                if (token) {
                    setAccessToken((prev) => (prev === token ? prev : token))
                    saveSpotifyPlayerCache({ accessToken: token })
                    await Promise.all([loadCurrentTrack(token), loadQueue(token)])
                    intervalId = window.setInterval(async () => {
                        const valid = (await getValidSpotifyAccessToken()) || envToken
                        if (!valid) return
                        if (!mounted) return
                        setAccessToken((prev) => (prev === valid ? prev : valid))
                        await Promise.all([loadCurrentTrack(valid), loadQueue(valid)])
                    }, 5000)
                    return
                }
                setAccessToken(null)
                setCurrentTrack(null)
                setQueue([])
                setDeviceName("Spotify")
                saveSpotifyPlayerCache({
                    accessToken: null,
                    currentTrack: null,
                    queue: [],
                    deviceName: "Spotify",
                })
            } catch (e) {
                if (!mounted) return
                pushToast(e instanceof Error ? e.message : String(e), {
                    kind: "error",
                })
            }
        }
        const cleanupPromise = init()
        return () => {
            mounted = false
            if (intervalId) window.clearInterval(intervalId)
            void cleanupPromise
        }
    }, [])
    const mapSpotifyTrackToTrack = (t: any, progressMs: number): Track => {
        return {
            id: t?.id,
            uri: t?.uri,
            title: t?.name ?? "-",
            artist: Array.isArray(t?.artists)
                ? t.artists
                      .map((a: any) => a?.name)
                      .filter(Boolean)
                      .join(", ")
                : "-",
            album: t?.album?.name ?? "-",
            coverUrl: t?.album?.images?.[0]?.url ?? "",
            duration: Number(t?.duration_ms ?? 0),
            progress: Math.max(0, Math.floor(progressMs)),
        }
    }
    const loadRecent = async (token: string) => {
        const t = await getRecentlyPlayedTrack(token)
        if (!t) return
        const mapped = mapSpotifyTrackToTrack(t, 0)
        setRecentTrack((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(mapped)) return prev
            saveSpotifyPlayerCache({ recentTrack: mapped })
            return mapped
        })
    }
    const loadCurrentTrack = async (token: string) => {
        const state = await getPlayerState(token)
        if (!state || !state.track) {
            setCurrentTrack((prev) => (prev === null ? prev : null))
            saveSpotifyPlayerCache({ currentTrack: null, isPlaying: false })
            await loadRecent(token)
            return
        }
        {
            const now = Date.now()
            contextUriRef.current = state.contextUri ?? null
            const incomingTrackId = state.track.id
            const trackChanged =
                typeof incomingTrackId === "string" && incomingTrackId !== lastTrackIdRef.current
            const mapped = mapSpotifyTrackToTrack(state.track, state.progress_ms)
            const nextDevice = state.device?.name || "Device"
            setCurrentTrack((prev) =>
                prev &&
                prev.id === mapped.id &&
                prev.title === mapped.title &&
                prev.artist === mapped.artist &&
                prev.coverUrl === mapped.coverUrl &&
                prev.duration === mapped.duration
                    ? prev
                    : mapped
            )
            setIsPlaying((prev) => (prev === state.is_playing ? prev : state.is_playing))
            setDeviceName((prev) => (prev === nextDevice ? prev : nextDevice))
            if (typeof state.shuffle_state === "boolean") {
                setShuffleOn((prev) => (prev === state.shuffle_state ? prev : state.shuffle_state!))
            }
            if (state.repeat_state) {
                setRepeatModeState((prev) =>
                    prev === state.repeat_state ? prev : state.repeat_state!
                )
            }
            saveSpotifyPlayerCache({
                currentTrack: mapped,
                isPlaying: state.is_playing,
                deviceName: nextDevice,
                contextUri: state.contextUri ?? null,
                ...(typeof state.shuffle_state === "boolean"
                    ? { shuffleOn: state.shuffle_state }
                    : {}),
                ...(state.repeat_state ? { repeatMode: state.repeat_state } : {}),
            })
            const serverMs = Math.max(0, Math.floor(state.progress_ms))
            const predictedMs =
                isPlayingRef.current && progressSyncAtRef.current
                    ? progressBaseRef.current + (now - progressSyncAtRef.current)
                    : serverMs
            const closeEnough = Math.abs(serverMs - predictedMs) <= 1200
            const nextBase =
                trackChanged || !state.is_playing || !closeEnough
                    ? serverMs
                    : Math.max(serverMs, Math.floor(predictedMs))
            lastTrackIdRef.current = incomingTrackId
            setProgressBaseMs(nextBase)
            setProgressSyncAt(now)
            setDisplayProgressMs(nextBase)
            saveSpotifyPlayerCache({ progressBaseMs: nextBase, progressSyncAt: now })
        }
    }
    const dominantColorCacheRef = useRef<Map<string, string>>(new Map())
    useEffect(() => {
        if (!currentTrack?.id || !currentTrack.coverUrl) return
        const trackId = currentTrack.id
        const coverUrl = currentTrack.coverUrl
        const cached = dominantColorCacheRef.current.get(trackId)
        if (cached) {
            setAccentColor(cached)
            return
        }
        let alive = true
        ;(async () => {
            const color = await extractDominantColor(coverUrl)
            if (!alive || !color) return
            dominantColorCacheRef.current.set(trackId, color)
            setAccentColor(color)
        })()
        return () => {
            alive = false
        }
    }, [currentTrack?.id])
    const waveMask =
        "linear-gradient(to right, transparent 0px, black 50px, black calc(100% - 50px), transparent 100%)"
    const waveBgUrls = useMemo(() => {
        const rgb = parseColorToRgb(accentColor)
        const highlightA = rgb ? lightenRgb(rgb, 0.42) : { r: 255, g: 255, b: 255 }
        const highlightB = rgb ? lightenRgb(rgb, 0.22) : { r: 240, g: 240, b: 240 }
        return {
            wave1: makeWaveDataUrl(`rgb(${highlightA.r}, ${highlightA.g}, ${highlightA.b})`, {
                amplitude: 7,
                opacity: 0.6,
                period: 125,
            }),
            wave2: makeWaveDataUrl(`rgb(${highlightB.r}, ${highlightB.g}, ${highlightB.b})`, {
                amplitude: 5,
                opacity: 0.5,
                period: 100,
            }),
        }
    }, [accentColor])
    const { playlistGradient, playlistRepresentative } = useMemo(() => {
        try {
            const base = oklch(accentColor) as any
            if (!base || typeof base.l !== "number") throw new Error("invalid base color")
            const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
            const a: Oklch = {
                mode: "oklch",
                l: clamp01(base.l + 0.06),
                c: Math.max(0, base.c * 0.9),
                h: base.h,
            }
            const b: Oklch = {
                mode: "oklch",
                l: clamp01(base.l + 0.18),
                c: Math.max(0, base.c * 0.7),
                h: base.h,
            }
            const aRgb = formatRgb(a)
            const bRgb = formatRgb(b)
            const grad = `linear-gradient(to bottom right, ${aRgb}, ${bRgb})`
            return { playlistGradient: grad, playlistRepresentative: aRgb }
        } catch {
            const rgb = parseColorToRgb(accentColor)
            if (!rgb) return { playlistGradient: "#b1b1b1", playlistRepresentative: "#b1b1b1" }
            const bg = lightenRgb(rgb, 0.2)
            const col = `rgb(${bg.r}, ${bg.g}, ${bg.b})`
            return { playlistGradient: col, playlistRepresentative: col }
        }
    }, [accentColor])

    //
    const textColor = getReadableTextColor(playlistRepresentative)
    useEffect(() => {
        if (!currentTrack) return
        if (isSeeking) return
        const tick = () => {
            if (!currentTrack) return
            if (!isPlaying || !progressSyncAt) {
                setDisplayProgressMs(progressBaseMs)
                return
            }
            const next = progressBaseMs + (Date.now() - progressSyncAt)
            const clamped = Math.min(currentTrack.duration, Math.max(0, Math.floor(next)))
            setDisplayProgressMs(clamped)
        }
        tick()
        const id = window.setInterval(tick, 200)
        return () => window.clearInterval(id)
    }, [currentTrack, isPlaying, isSeeking, progressBaseMs, progressSyncAt])
    const loadQueue = async (token: string) => {
        const q = await getQueue(token)
        if (!q) return
        const mapped = (q.queue ?? []).slice(0, 12).map((t) => ({
            uri: t.uri,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            album: t.album.name,
            coverUrl: t.album.images[2]?.url || t.album.images[0]?.url || "",
        }))
        setQueue((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(mapped)) return prev
            saveSpotifyPlayerCache({ queue: mapped })
            return mapped
        })
    }
    const handlePlayPause = async () => {
        if (accessToken) {
            const success = await playPause(accessToken, !isPlaying)
            if (success) {
                const now = Date.now()
                if (isPlaying) {
                    setProgressBaseMs(displayProgressMs)
                    setProgressSyncAt(now)
                } else {
                    setProgressBaseMs(displayProgressMs)
                    setProgressSyncAt(now)
                }
                setIsPlaying(!isPlaying)
            }
        } else {
            setIsPlaying(!isPlaying)
        }
    }
    const handleShuffle = async () => {
        if (!accessToken) return
        const next = !shuffleOn
        const ok = await setShuffle(accessToken, next)
        if (ok) setShuffleOn(next)
    }
    const handlePlaylistMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        const el = playlistScrollRef.current
        if (!el) return
        isDraggingPlaylistRef.current = true
        hasDraggedPlaylistRef.current = false
        playlistStartYRef.current = e.clientY
        playlistScrollTopRef.current = el.scrollTop
    }
    const handlePlaylistMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingPlaylistRef.current) return
        const el = playlistScrollRef.current
        if (!el) return
        const deltaY = e.clientY - playlistStartYRef.current
        if (Math.abs(deltaY) > 5) {
            hasDraggedPlaylistRef.current = true
        }
        el.scrollTop = playlistScrollTopRef.current - deltaY
    }
    const handlePlaylistMouseUpOrLeave = () => {
        isDraggingPlaylistRef.current = false
    }
    const handlePlayQueueItem = async (uri?: string) => {
        if (!accessToken || !uri) return
        const idx = queue.findIndex((q) => q.uri === uri)
        if (idx < 0) return
        // 셔플 상태에서는 context_uri + offset 호출 시 Spotify가 큐를 재셔플하므로 skipToNext 사용
        const jumped =
            !shuffleOn && contextUriRef.current
                ? await jumpToQueueTrack(accessToken, uri, contextUriRef.current)
                : false
        if (!jumped) {
            for (let i = 0; i <= idx; i++) {
                await skipToNext(accessToken)
                await new Promise((r) => setTimeout(r, 60))
            }
        }
        setTimeout(() => {
            void loadCurrentTrack(accessToken)
            void loadQueue(accessToken)
        }, 400)
    }
    useEffect(() => {
        if (!accessToken || !currentTrack?.id) {
            setIsSaved(false)
            return
        }
        const trackId = currentTrack.id
        let active = true
        void checkSavedTrack(accessToken, trackId).then((saved) => {
            if (!active || saved === null) return
            setIsSaved(saved)
            saveSpotifyPlayerCache({ isSaved: saved, savedTrackId: trackId })
        })
        return () => {
            active = false
        }
    }, [accessToken, currentTrack?.id])

    useEffect(() => {
        if (!accessToken || playlistTab !== "library") return
        let active = true
        void getUserLibrary(accessToken).then(({ items, needsRelogin }) => {
            if (!active) return
            setLibraryItems(items)
            setLibraryNeedsRelogin(needsRelogin)
        })
        return () => {
            active = false
        }
    }, [accessToken, playlistTab])

    const handlePlayLibrary = async (item: SpotifyLibraryItem) => {
        if (!accessToken) return
        const ok = await playLibraryItem(accessToken, item)
        if (ok) {
            setTimeout(() => {
                void loadCurrentTrack(accessToken)
                void loadQueue(accessToken)
            }, 450)
        }
    }

    const filteredLibraryItems = useMemo(() => {
        if (libraryFilter === "all") return libraryItems
        if (libraryFilter === "playlist") {
            return libraryItems.filter((i) => i.type === "playlist" || i.type === "liked")
        }
        return libraryItems.filter((i) => i.type === libraryFilter)
    }, [libraryItems, libraryFilter])

    const handleToggleSave = async () => {
        if (!accessToken || !currentTrack?.id) return
        const next = !isSaved
        setIsSaved(next)
        if (next) setHeartBurstId((n) => n + 1)
        saveSpotifyPlayerCache({ isSaved: next, savedTrackId: currentTrack.id })
        const ok = await setSavedTrack(accessToken, currentTrack.id, next)
        if (!ok) {
            setIsSaved(!next)
            saveSpotifyPlayerCache({ isSaved: !next, savedTrackId: currentTrack.id })
        }
    }

    const handleRepeat = async () => {
        if (!accessToken) return
        const nextMode =
            repeatMode === "off" ? "context" : repeatMode === "context" ? "track" : "off"
        const ok = await setRepeatMode(accessToken, nextMode)
        if (ok) setRepeatModeState(nextMode)
    }
    const handleNext = async () => {
        if (accessToken) {
            await skipToNext(accessToken)
            setTimeout(() => {
                void loadCurrentTrack(accessToken)
                void loadQueue(accessToken)
            }, 500)
        }
    }
    const handlePrevious = async () => {
        if (accessToken) {
            await skipToPrevious(accessToken)
            setTimeout(() => {
                void loadCurrentTrack(accessToken)
                void loadQueue(accessToken)
            }, 500)
        }
    }

    const updateSeekPreviewFromClientX = (clientX: number, rect: DOMRect) => {
        if (!currentTrack) return 0
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
        const pos = Math.round(ratio * currentTrack.duration)
        setDisplayProgressMs(pos)
        setProgressBaseMs(pos)
        setProgressSyncAt(Date.now())
        return pos
    }
    const handleSeekCommit = async (posMs: number) => {
        if (!accessToken) return
        const ok = await seekToPosition(accessToken, posMs)
        if (!ok) {
            void loadCurrentTrack(accessToken)
        }
    }
    if (!accessToken) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-[#14171a] via-[#121214] to-[#0b0d0e] relative flex flex-col items-center justify-center gap-6 px-6 text-center overflow-hidden">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center">
                    <FaSpotify className="w-9 h-9 sm:w-11 sm:h-11 text-[#1DB954]" />
                </div>
                <div>
                    <h2 className="text-white text-2xl sm:text-3xl font-bold tracking-tight">
                        Spotify 연결
                    </h2>
                    <p className="mt-2 text-white/50 text-sm sm:text-base">
                        계정을 연결해서 좋아하는 노래는 재생해보세요.
                    </p>
                </div>
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={async () => {
                        await logoutSpotify()
                        setAccessToken(null)
                        startSpotifyLogin()
                    }}
                    className="mt-1 flex items-center gap-3 px-7 py-3.5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] text-black text-base sm:text-lg font-bold transition-all cursor-pointer"
                >
                    Spotify 로그인
                </button>
            </div>
        )
    }
    if (!currentTrack) {
        return (
            <div className="w-full h-full bg-[#161618] relative flex items-center justify-center overflow-hidden">
                {recentTrack ? (
                    <>
                        {recentTrack.coverUrl ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-45"
                                style={{
                                    backgroundImage: `url(${recentTrack.coverUrl})`,
                                }}
                            />
                        ) : null}
                        <div className="absolute inset-0 bg-black/45" />
                        <div className="relative z-10 max-w-[1100px] w-full px-8 sm:px-16 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
                            {recentTrack.coverUrl && (
                                <img
                                    src={recentTrack.coverUrl}
                                    alt={recentTrack.album}
                                    className="w-48 h-48 sm:w-64 sm:h-64 rounded-3xl shadow-2xl object-cover ring-1 ring-white/15 shrink-0"
                                />
                            )}
                            <div className="min-w-0 text-center sm:text-left">
                                <div className="inline-flex items-center gap-2 text-white/70 text-xs sm:text-sm font-semibold mb-3">
                                    <FaSpotify className="w-5 h-5 text-[#1DB954]" />
                                    <span>최근 재생</span>
                                </div>
                                <div className="text-white text-[clamp(1.75rem,4vw,3.25rem)] font-bold leading-tight truncate">
                                    {recentTrack.title}
                                </div>
                                <div className="mt-2 text-white/65 text-base sm:text-xl font-medium truncate">
                                    {recentTrack.artist}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-white/50">
                        <FaSpotify className="w-10 h-10 opacity-60" />
                        <div className="text-lg font-medium">음악 재생 중이 아닙니다</div>
                    </div>
                )}
            </div>
        )
    }
    const progressPercent = (displayProgressMs / currentTrack.duration) * 100
    const currentTime = formatTime(displayProgressMs)
    const totalTime = formatTime(currentTrack.duration)
    const safeRatio = Number.isFinite(progressPercent)
        ? Math.min(100, Math.max(0, progressPercent))
        : 0
    const nextSong = queue[0]
    const listItems = queue.slice(0, 12)
    const nextSongLabel = nextSong ? truncateText(nextSong.title, 30) : "-"
    return (
        <div
            className="w-full h-full bg-[#121214] overflow-hidden relative select-none"
            style={{ containerType: "size" }}
            data-disable-widget-swipe="true"
        >
            {/* 풀스크린 블러 앨범 배경 (정사각형 전체 영역을 일정 속도로 반사 유영) */}
            {currentTrack.coverUrl ? (
                <div
                    ref={ambientBgRef}
                    className="absolute left-1/2 top-1/2 bg-cover bg-center blur-3xl opacity-55 will-change-transform pointer-events-none"
                    style={{
                        backgroundImage: `url(${currentTrack.coverUrl})`,
                        transform: "translate3d(-50%, -50%, 0) scale(1.35)",
                    }}
                />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-br from-black/45 via-black/35 to-black/65" />

            {/* 메인 풀페이지 레이아웃 */}
            <div className="relative z-10 h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-0">
                {/* 상단 디바이스 + 플레이리스트 토글 (상단 좌우 끝 고정 정렬) */}
                <div
                    className="absolute top-5 sm:top-6 left-6 sm:left-14 lg:left-20 right-6 sm:right-14 lg:right-20 z-20 flex items-center justify-between gap-3"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-2.5 text-white/85 min-w-0">
                        <FaSpotify className="w-6 h-6 text-[#1DB954] shrink-0" />
                        <span className="text-sm sm:text-base font-semibold truncate">
                            {deviceName}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowPlaylist((prev) => !prev)}
                            className={`inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold ring-1 transition-colors cursor-pointer ${
                                showPlaylist
                                    ? "bg-white text-neutral-950 ring-white"
                                    : "bg-white/10 hover:bg-white/15 text-white/80 hover:text-white ring-white/15"
                            }`}
                            aria-label={showPlaylist ? "재생목록 접기" : "재생목록 열기"}
                        >
                            <span>재생목록</span>
                        </button>
                    </div>
                </div>

                {/* 좌측(또는 중앙): Now Playing */}
                <div
                    className={`flex flex-col justify-center min-w-0 w-full flex-1 transition-[max-width] duration-300 ease-out ${
                        showPlaylist ? "gap-6 max-w-[820px]" : "gap-8 sm:gap-10 max-w-[1240px]"
                    }`}
                >
                    {/* 앨범 아트 + 곡 정보 + 프로그레스 + 컨트롤 (접기 시 좌우 분할) */}
                    <div
                        className={`grid min-w-0 ${
                            showPlaylist
                                ? "grid-cols-[auto_1fr] items-center gap-x-6 sm:gap-x-8 gap-y-6"
                                : "grid-cols-1 md:grid-cols-[auto_1fr] md:grid-rows-[auto_auto_auto] content-center items-center gap-y-5 md:gap-x-10 lg:gap-x-14"
                        }`}
                    >
                        {currentTrack.coverUrl ? (
                            <motion.img
                                layout
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                src={currentTrack.coverUrl}
                                alt={currentTrack.album}
                                className={`rounded-3xl object-cover aspect-square shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/15 shrink-0 ${
                                    showPlaylist
                                        ? "col-start-1 row-start-1 w-28 sm:w-44 lg:w-[min(36cqh,208px)]"
                                        : "mx-auto md:mx-0 md:col-start-1 md:row-start-1 md:row-span-3 w-[min(46cqh,38cqw,420px)]"
                                }`}
                            />
                        ) : null}
                        <motion.div
                            layout="position"
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className={`min-w-0 w-full flex items-center justify-between gap-4 ${
                                showPlaylist
                                    ? `${currentTrack.coverUrl ? "col-start-2" : "col-span-2"} row-start-1`
                                    : `${currentTrack.coverUrl ? "md:col-start-2" : "md:col-span-2"} md:row-start-1 md:self-end text-center md:text-left`
                            }`}
                        >
                            <div className="min-w-0 flex-1">
                                <MarqueeText
                                    text={currentTrack.title}
                                    className={`text-white font-bold leading-[1.1] transition-all duration-300 ${
                                        showPlaylist
                                            ? "text-[clamp(1.5rem,3vw,2.6rem)]"
                                            : "text-[clamp(2rem,4.4vw,3.85rem)]"
                                    }`}
                                />
                                <MarqueeText
                                    text={currentTrack.artist}
                                    className={`mt-0.5 sm:mt-1 text-white/75 font-semibold transition-all duration-300 ${
                                        showPlaylist
                                            ? "text-[clamp(0.875rem,1.2vw,1.05rem)]"
                                            : "text-[clamp(1.05rem,1.75vw,1.45rem)]"
                                    }`}
                                />
                            </div>
                            {currentTrack.id ? (
                                <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={handleToggleSave}
                                    aria-label={isSaved ? "좋아요 취소" : "좋아요"}
                                    className="relative shrink-0 p-2 rounded-full hover:bg-white/10 transition active:scale-90 cursor-pointer"
                                >
                                    {heartBurstId > 0 ? (
                                        <span
                                            key={heartBurstId}
                                            className="absolute inset-0 pointer-events-none flex items-center justify-center"
                                        >
                                            <motion.span
                                                initial={{ scale: 0.4, opacity: 0.85 }}
                                                animate={{ scale: 1.9, opacity: 0 }}
                                                transition={{ duration: 0.42, ease: "easeOut" }}
                                                className="absolute w-7 h-7 rounded-full border-2 border-[#1DB954]"
                                            />
                                            {Array.from({ length: 8 }, (_, idx) => {
                                                const angle = (idx / 8) * Math.PI * 2
                                                const dist = idx % 2 === 0 ? 24 : 18
                                                const tx = Math.cos(angle) * dist
                                                const ty = Math.sin(angle) * dist
                                                const color =
                                                    idx % 3 === 0
                                                        ? "#1DB954"
                                                        : idx % 3 === 1
                                                          ? "#86EFAC"
                                                          : "#FFFFFF"
                                                return (
                                                    <motion.span
                                                        key={idx}
                                                        initial={{
                                                            x: 0,
                                                            y: 0,
                                                            scale: 0.4,
                                                            opacity: 1,
                                                        }}
                                                        animate={{
                                                            x: tx,
                                                            y: ty,
                                                            scale: [0.6, 1.1, 0],
                                                            opacity: [1, 1, 0],
                                                        }}
                                                        transition={{
                                                            duration: 0.48,
                                                            ease: [0.16, 1, 0.3, 1],
                                                        }}
                                                        className="absolute w-1.5 h-1.5 rounded-full"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                )
                                            })}
                                        </span>
                                    ) : null}
                                    <motion.span
                                        key={isSaved ? `saved-${heartBurstId}` : "unsaved"}
                                        initial={
                                            isSaved && heartBurstId > 0 ? { scale: 0.7 } : false
                                        }
                                        animate={{
                                            scale:
                                                isSaved && heartBurstId > 0
                                                    ? [0.7, 1.32, 0.92, 1]
                                                    : 1,
                                        }}
                                        transition={{ duration: 0.34, ease: "easeOut" }}
                                        className="block relative z-10"
                                    >
                                        {isSaved ? (
                                            <FaHeart className="w-6 h-6 sm:w-7 sm:h-7 text-[#1DB954]" />
                                        ) : (
                                            <FaRegHeart className="w-6 h-6 sm:w-7 sm:h-7 text-white/60 hover:text-white" />
                                        )}
                                    </motion.span>
                                </button>
                            ) : null}
                        </motion.div>

                        {/* 프로그레스 바 (액체 물결 오버레이) */}
                        <motion.div
                            layout="position"
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className={`w-full ${
                                showPlaylist
                                    ? "col-span-2 row-start-2 pt-5"
                                    : `${currentTrack.coverUrl ? "md:col-start-2" : "md:col-span-2"} md:row-start-2 pt-1 md:pt-2`
                            }`}
                        >
                            <div className="relative h-6 flex items-center">
                                <LiquidWaveOverlay
                                    color={accentColor}
                                    isPlaying={isPlaying}
                                    widthPercent={safeRatio}
                                />
                                <div className="relative w-full h-2.5 rounded-full bg-white/25 overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${safeRatio}%`,
                                            backgroundColor: accentColor,
                                        }}
                                    />
                                </div>
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full shadow-md ring-2 ring-black/15 pointer-events-none"
                                    style={{
                                        left: `${safeRatio}%`,
                                        backgroundColor: accentColor,
                                    }}
                                />
                                <div
                                    className="absolute inset-0 cursor-pointer touch-pan-y"
                                    style={{ touchAction: "pan-y" }}
                                    onPointerDown={(e) => {
                                        e.stopPropagation()
                                        if (e.pointerType === "mouse") {
                                            e.preventDefault()
                                            ;(e.currentTarget as HTMLDivElement).setPointerCapture(
                                                e.pointerId
                                            )
                                            setIsSeeking(true)
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            const pos = updateSeekPreviewFromClientX(
                                                e.clientX,
                                                rect
                                            )
                                            seekCommittedPosRef.current = pos
                                        } else {
                                            seekStartXRef.current = e.clientX
                                            seekStartYRef.current = e.clientY
                                            seekStartTimeRef.current = Date.now()
                                            seekGestureLockRef.current = "undecided"
                                        }
                                    }}
                                    onPointerMove={(e) => {
                                        if (e.pointerType === "mouse") {
                                            e.stopPropagation()
                                            if (!isSeeking) return
                                            e.preventDefault()
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            updateSeekPreviewFromClientX(e.clientX, rect)
                                        } else {
                                            if (seekStartXRef.current === null) return
                                            const dx = e.clientX - seekStartXRef.current
                                            const dy = e.clientY - (seekStartYRef.current ?? 0)
                                            if (
                                                seekGestureLockRef.current === "undecided" &&
                                                Math.abs(dx) > 10 &&
                                                Math.abs(dx) > Math.abs(dy) * 1.2
                                            ) {
                                                seekGestureLockRef.current = "horizontal"
                                                setIsSeeking(true)
                                                e.stopPropagation()
                                            }
                                            if (seekGestureLockRef.current === "horizontal") {
                                                e.stopPropagation()
                                                const rect = e.currentTarget.getBoundingClientRect()
                                                updateSeekPreviewFromClientX(e.clientX, rect)
                                            }
                                        }
                                    }}
                                    onPointerUp={(e) => {
                                        e.stopPropagation()
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        if (isSeeking || e.pointerType === "mouse") {
                                            const pos = updateSeekPreviewFromClientX(
                                                e.clientX,
                                                rect
                                            )
                                            setIsSeeking(false)
                                            void handleSeekCommit(pos)
                                        }
                                        seekStartXRef.current = null
                                        seekCommittedPosRef.current = null
                                        seekGestureLockRef.current = "undecided"
                                    }}
                                    onPointerCancel={() => {
                                        setIsSeeking(false)
                                        seekCommittedPosRef.current = null
                                        seekStartXRef.current = null
                                        seekGestureLockRef.current = "undecided"
                                    }}
                                />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-white/75 tabular-nums">
                                <span>{currentTime}</span>
                                <span>{totalTime}</span>
                            </div>
                        </motion.div>

                        {/* 재생 컨트롤 */}
                        <motion.div
                            layout="position"
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className={`flex items-center justify-center pt-1 ${
                                showPlaylist
                                    ? "col-span-2 row-start-3 gap-7 sm:gap-10"
                                    : `${currentTrack.coverUrl ? "md:col-start-2" : "md:col-span-2"} md:row-start-3 md:self-start gap-9 sm:gap-12`
                            }`}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={handleShuffle}
                                className="text-white hover:scale-105 transition-transform cursor-pointer"
                                aria-label="Shuffle"
                                style={{ opacity: shuffleOn ? 1 : 0.45 }}
                            >
                                <FaShuffle
                                    className={
                                        showPlaylist
                                            ? "w-6 h-6 sm:w-7 sm:h-7"
                                            : "w-7 h-7 sm:w-8 sm:h-8"
                                    }
                                />
                            </button>
                            <button
                                type="button"
                                onClick={handlePrevious}
                                className="text-white hover:scale-105 transition-transform cursor-pointer"
                                aria-label="Previous"
                            >
                                <FaBackwardStep
                                    className={
                                        showPlaylist
                                            ? "w-7 h-7 sm:w-8 sm:h-8"
                                            : "w-8 h-8 sm:w-10 sm:h-10"
                                    }
                                />
                            </button>
                            <button
                                type="button"
                                onClick={handlePlayPause}
                                className={`rounded-full bg-white text-neutral-950 hover:scale-105 flex items-center justify-center shadow-xl transition-all cursor-pointer ${
                                    showPlaylist
                                        ? "w-14 h-14 sm:w-16 sm:h-16"
                                        : "w-16 h-16 sm:w-20 sm:h-20"
                                }`}
                                aria-label={isPlaying ? "Pause" : "Play"}
                            >
                                {isPlaying ? (
                                    <FaPause
                                        className={
                                            showPlaylist
                                                ? "w-6 h-6 sm:w-7 sm:h-7"
                                                : "w-7 h-7 sm:w-8 sm:h-8"
                                        }
                                    />
                                ) : (
                                    <FaPlay
                                        className={`ml-0.5 ${
                                            showPlaylist
                                                ? "w-6 h-6 sm:w-7 sm:h-7"
                                                : "w-7 h-7 sm:w-8 sm:h-8"
                                        }`}
                                    />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleNext}
                                className="text-white hover:scale-105 transition-transform cursor-pointer"
                                aria-label="Next"
                            >
                                <FaForwardStep
                                    className={
                                        showPlaylist
                                            ? "w-7 h-7 sm:w-8 sm:h-8"
                                            : "w-8 h-8 sm:w-10 sm:h-10"
                                    }
                                />
                            </button>
                            <button
                                type="button"
                                onClick={handleRepeat}
                                className="text-white hover:scale-105 transition-transform cursor-pointer relative"
                                aria-label="Repeat"
                                style={{ opacity: repeatMode === "off" ? 0.45 : 1 }}
                            >
                                <FaRepeat
                                    className={
                                        showPlaylist
                                            ? "w-6 h-6 sm:w-7 sm:h-7"
                                            : "w-7 h-7 sm:w-8 sm:h-8"
                                    }
                                />
                                {repeatMode === "track" && (
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-extrabold text-white leading-none pointer-events-none">
                                        1
                                    </span>
                                )}
                            </button>
                        </motion.div>
                    </div>
                </div>

                {/* 우측: Playlist / Up Next (접기/펼치기 가능) */}
                <AnimatePresence initial={false}>
                    {showPlaylist && (
                        <motion.div
                            initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                            animate={{ opacity: 1, width: "min(100%, 440px)", marginLeft: 48 }}
                            exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="shrink-0 overflow-hidden h-[300px] lg:h-full lg:max-h-[640px] max-lg:!ml-0 max-lg:!w-full"
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <motion.div
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full lg:w-[440px] h-full flex flex-col rounded-[32px] p-6 ring-1 ring-white/15 backdrop-blur-2xl overflow-hidden"
                                style={{
                                    backgroundImage: playlistGradient,
                                    backgroundColor: playlistRepresentative,
                                }}
                            >
                                <div className="flex items-center justify-between gap-3 pb-4 shrink-0">
                                    <div className="min-w-0">
                                        <div
                                            className="text-2xl font-bold leading-tight"
                                            style={{ color: textColor }}
                                        >
                                            {playlistTab === "playlist"
                                                ? "재생목록"
                                                : "내 라이브러리"}
                                        </div>
                                        <div
                                            className="text-xs font-medium truncate mt-0.5"
                                            style={{ color: applyOpacity(textColor, 0.7).rgba }}
                                        >
                                            {playlistTab === "playlist"
                                                ? `Next : ${nextSongLabel}`
                                                : `${filteredLibraryItems.length}개 항목`}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                                    <AnimatePresence mode="wait" initial={false}>
                                        {playlistTab === "playlist" ? (
                                            <motion.div
                                                key="tab-playlist"
                                                initial={{ opacity: 0, x: -16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                transition={{
                                                    duration: 0.18,
                                                    ease: [0.22, 1, 0.36, 1],
                                                }}
                                                ref={playlistScrollRef}
                                                onMouseDown={handlePlaylistMouseDown}
                                                onMouseMove={handlePlaylistMouseMove}
                                                onMouseUp={handlePlaylistMouseUpOrLeave}
                                                onMouseLeave={handlePlaylistMouseUpOrLeave}
                                                onTouchStart={(e) => e.stopPropagation()}
                                                onTouchMove={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-5 cursor-grab active:cursor-grabbing touch-pan-y select-none"
                                                style={{
                                                    touchAction: "pan-y",
                                                    overscrollBehavior: "contain",
                                                    WebkitOverflowScrolling: "touch",
                                                    maskImage:
                                                        "linear-gradient(to bottom, black 0%, black calc(100% - 36px), transparent 100%)",
                                                    WebkitMaskImage:
                                                        "linear-gradient(to bottom, black 0%, black calc(100% - 36px), transparent 100%)",
                                                }}
                                            >
                                                {listItems.map((t, idx) => (
                                                    <div
                                                        key={`${t.title}-${idx}`}
                                                        className="flex items-center gap-3.5 p-2 rounded-2xl hover:bg-black/10 transition-colors cursor-pointer select-none"
                                                        role="button"
                                                        aria-label={`Play ${t.title}`}
                                                        onClick={() => {
                                                            if (hasDraggedPlaylistRef.current)
                                                                return
                                                            void handlePlayQueueItem(t.uri)
                                                        }}
                                                    >
                                                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/20 shrink-0 pointer-events-none">
                                                            {t.coverUrl ? (
                                                                <img
                                                                    src={t.coverUrl}
                                                                    alt={t.album}
                                                                    draggable={false}
                                                                    className="w-full h-full object-cover select-none pointer-events-none"
                                                                />
                                                            ) : null}
                                                        </div>
                                                        <div className="min-w-0 flex-1 pointer-events-none select-none">
                                                            <div
                                                                className="text-base font-semibold leading-tight truncate"
                                                                style={{ color: textColor }}
                                                            >
                                                                {t.title}
                                                            </div>
                                                            <div
                                                                className="mt-1 text-xs truncate"
                                                                style={{
                                                                    color: applyOpacity(
                                                                        textColor,
                                                                        0.7
                                                                    ).rgba,
                                                                }}
                                                            >
                                                                {t.artist}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="tab-library"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 16 }}
                                                transition={{
                                                    duration: 0.18,
                                                    ease: [0.22, 1, 0.36, 1],
                                                }}
                                                className="flex-1 min-h-0 flex flex-col"
                                            >
                                                {/* 필터 칩 */}
                                                <div className="flex items-center gap-1.5 pb-3 shrink-0 overflow-x-auto no-scrollbar">
                                                    {(
                                                        [
                                                            { id: "all", label: "전체" },
                                                            {
                                                                id: "playlist",
                                                                label: "플레이리스트",
                                                            },
                                                            { id: "album", label: "앨범" },
                                                            { id: "artist", label: "아티스트" },
                                                        ] as const
                                                    ).map((f) => {
                                                        const active = libraryFilter === f.id
                                                        return (
                                                            <button
                                                                key={f.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    setLibraryFilter(f.id)
                                                                }
                                                                className="relative px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                                                                style={{
                                                                    backgroundColor: active
                                                                        ? "transparent"
                                                                        : applyOpacity(
                                                                              textColor,
                                                                              0.1
                                                                          ).rgba,
                                                                    color: active
                                                                        ? textColor
                                                                        : applyOpacity(
                                                                              textColor,
                                                                              0.75
                                                                          ).rgba,
                                                                }}
                                                            >
                                                                {active ? (
                                                                    <motion.span
                                                                        layoutId="library-filter-pill"
                                                                        transition={{
                                                                            type: "spring",
                                                                            stiffness: 420,
                                                                            damping: 32,
                                                                        }}
                                                                        className="absolute inset-0 rounded-full"
                                                                        style={{
                                                                            backgroundColor:
                                                                                applyOpacity(
                                                                                    textColor,
                                                                                    0.24
                                                                                ).rgba,
                                                                        }}
                                                                    />
                                                                ) : null}
                                                                <span className="relative z-10">
                                                                    {f.label}
                                                                </span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>

                                                {/* 라이브러리 목록 */}
                                                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                                                    <AnimatePresence mode="wait" initial={false}>
                                                        <motion.div
                                                            key={libraryFilter}
                                                            initial={{ opacity: 0, y: 8 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -6 }}
                                                            transition={{
                                                                duration: 0.16,
                                                                ease: [0.22, 1, 0.36, 1],
                                                            }}
                                                            ref={playlistScrollRef}
                                                            onMouseDown={handlePlaylistMouseDown}
                                                            onMouseMove={handlePlaylistMouseMove}
                                                            onMouseUp={handlePlaylistMouseUpOrLeave}
                                                            onMouseLeave={
                                                                handlePlaylistMouseUpOrLeave
                                                            }
                                                            onTouchStart={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                            onTouchMove={(e) => e.stopPropagation()}
                                                            onPointerDown={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                            className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1 pb-5 cursor-grab active:cursor-grabbing touch-pan-y select-none"
                                                            style={{
                                                                touchAction: "pan-y",
                                                                overscrollBehavior: "contain",
                                                                WebkitOverflowScrolling: "touch",
                                                                maskImage:
                                                                    "linear-gradient(to bottom, black 0%, black calc(100% - 36px), transparent 100%)",
                                                                WebkitMaskImage:
                                                                    "linear-gradient(to bottom, black 0%, black calc(100% - 36px), transparent 100%)",
                                                            }}
                                                        >
                                                            {libraryNeedsRelogin &&
                                                            filteredLibraryItems.length === 0 ? (
                                                                <div
                                                                    className="text-xs py-10 text-center leading-relaxed"
                                                                    style={{
                                                                        color: applyOpacity(
                                                                            textColor,
                                                                            0.7
                                                                        ).rgba,
                                                                    }}
                                                                >
                                                                    라이브러리 권한이 필요합니다.
                                                                    <br />
                                                                    설정에서 Spotify 재로그인해
                                                                    주세요.
                                                                </div>
                                                            ) : (
                                                                filteredLibraryItems.map((item) => (
                                                                    <div
                                                                        key={`${item.type}-${item.id}`}
                                                                        role="button"
                                                                        onClick={() => {
                                                                            if (
                                                                                hasDraggedPlaylistRef.current
                                                                            )
                                                                                return
                                                                            void handlePlayLibrary(
                                                                                item
                                                                            )
                                                                        }}
                                                                        className="flex items-center gap-3.5 p-2 rounded-2xl hover:bg-black/10 transition-colors cursor-pointer select-none"
                                                                    >
                                                                        {item.type === "liked" ? (
                                                                            <div className="w-12 h-12 rounded-xl shrink-0 bg-gradient-to-br from-[#450af5] to-[#c4efd9] flex items-center justify-center shadow">
                                                                                <FaHeart className="w-5 h-5 text-white" />
                                                                            </div>
                                                                        ) : (
                                                                            <div
                                                                                className={`w-12 h-12 overflow-hidden bg-white/20 shrink-0 ${
                                                                                    item.type ===
                                                                                    "artist"
                                                                                        ? "rounded-full"
                                                                                        : "rounded-xl"
                                                                                }`}
                                                                            >
                                                                                {item.imageUrl ? (
                                                                                    <img
                                                                                        src={
                                                                                            item.imageUrl
                                                                                        }
                                                                                        alt={
                                                                                            item.name
                                                                                        }
                                                                                        draggable={
                                                                                            false
                                                                                        }
                                                                                        className="w-full h-full object-cover"
                                                                                    />
                                                                                ) : null}
                                                                            </div>
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <div
                                                                                className="text-sm font-semibold leading-tight truncate"
                                                                                style={{
                                                                                    color: textColor,
                                                                                }}
                                                                            >
                                                                                {item.name}
                                                                            </div>
                                                                            <div
                                                                                className="mt-1 text-xs truncate"
                                                                                style={{
                                                                                    color: applyOpacity(
                                                                                        textColor,
                                                                                        0.7
                                                                                    ).rgba,
                                                                                }}
                                                                            >
                                                                                {item.subtitle}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </motion.div>
                                                    </AnimatePresence>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* 하단 탭 바: 1. 재생목록 / 2. 라이브러리 */}
                                <div
                                    className="mt-3 shrink-0 grid grid-cols-2 gap-1 p-1 rounded-2xl"
                                    style={{
                                        backgroundColor: applyOpacity(textColor, 0.1).rgba,
                                    }}
                                >
                                    {(
                                        [
                                            { id: "playlist", label: "재생목록" },
                                            { id: "library", label: "라이브러리" },
                                        ] as const
                                    ).map((tab) => {
                                        const active = playlistTab === tab.id
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setPlaylistTab(tab.id)}
                                                className="relative py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                                style={{
                                                    color: active
                                                        ? textColor
                                                        : applyOpacity(textColor, 0.6).rgba,
                                                }}
                                            >
                                                {active ? (
                                                    <motion.span
                                                        layoutId="playlist-tab-pill"
                                                        transition={{
                                                            type: "spring",
                                                            stiffness: 420,
                                                            damping: 32,
                                                        }}
                                                        className="absolute inset-0 rounded-xl"
                                                        style={{
                                                            backgroundColor: applyOpacity(
                                                                textColor,
                                                                0.2
                                                            ).rgba,
                                                        }}
                                                    />
                                                ) : null}
                                                <span className="relative z-10">{tab.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
}
function truncateText(value: string, maxChars: number): string {
    const s = value ?? ""
    if (maxChars <= 0) return ""
    if (s.length <= maxChars) return s
    if (maxChars === 1) return "…"
    return `${s.slice(0, maxChars - 1)}…`
}
function makeWaveDataUrl(
    color: string,
    opts: {
        amplitude: number
        opacity: number
        period: number
    }
): string {
    const width = 120
    const height = 14
    const baseline = 9
    const amp = Math.max(0, opts.amplitude)
    const period = Math.max(4, Math.floor(opts.period))
    const opacity = Math.min(1, Math.max(0, opts.opacity))
    const d = buildWavePath({
        width,
        baseline,
        amplitude: amp,
        period,
    })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
<path d="${d} L${width} ${height} L0 ${height} Z" fill="${color}" opacity="${opacity}" />
</svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
function buildWavePath(opts: {
    width: number
    baseline: number
    amplitude: number
    period: number
}): string {
    const { width, baseline, amplitude, period } = opts
    const half = period / 2
    const quarter = period / 4
    let d = `M0 ${baseline}`
    let x = 0
    let up = true
    while (x < width) {
        const xCtrl = x + quarter
        const xEnd = x + half
        const yCtrl = baseline + (up ? -amplitude : amplitude)
        const endX = Math.min(width, xEnd)
        const ctrlX = Math.min(width, xCtrl)
        d += ` Q${ctrlX} ${yCtrl} ${endX} ${baseline}`
        x = xEnd
        up = !up
    }
    return d
}
function parseColorToRgb(color: string): {
    r: number
    g: number
    b: number
} | null {
    const trimmed = color.trim()
    const rgbMatch = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(trimmed)
    if (rgbMatch) {
        return {
            r: clamp255(Number(rgbMatch[1])),
            g: clamp255(Number(rgbMatch[2])),
            b: clamp255(Number(rgbMatch[3])),
        }
    }
    const hexMatch = /^#?([0-9a-f]{6})$/i.exec(trimmed)
    if (hexMatch) {
        const hex = hexMatch[1]
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        }
    }
    return null
}
function clamp255(n: number): number {
    return Math.min(255, Math.max(0, Math.floor(n)))
}
function lightenRgb(
    rgb: {
        r: number
        g: number
        b: number
    },
    amount: number
): { r: number; g: number; b: number } {
    const a = Math.min(1, Math.max(0, amount))
    return {
        r: clamp255(rgb.r + (255 - rgb.r) * a),
        g: clamp255(rgb.g + (255 - rgb.g) * a),
        b: clamp255(rgb.b + (255 - rgb.b) * a),
    }
}
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
    try {
        try {
            const res = await fetch(imageUrl, {
                mode: "cors",
                cache: "force-cache",
            })
            if (res.ok) {
                const blob = await res.blob()
                const objectUrl = URL.createObjectURL(blob)
                try {
                    const palette = await new Vibrant(objectUrl).getPalette()
                    const rgb =
                        palette.Vibrant?.rgb ??
                        palette.Muted?.rgb ??
                        palette.LightVibrant?.rgb ??
                        palette.DarkVibrant?.rgb ??
                        palette.LightMuted?.rgb ??
                        palette.DarkMuted?.rgb ??
                        null
                    if (rgb) {
                        const [r, g, b] = rgb
                        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
                    }
                } finally {
                    URL.revokeObjectURL(objectUrl)
                }
            }
        } catch {
            // Vibrant 실패 → canvas fallback
        }
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.crossOrigin = "anonymous"
            el.decoding = "async"
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error("image load failed"))
            el.src = imageUrl
        })
        const size = 32
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return null
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const counts = new Map<number, number>()
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3]
            if (a < 200) continue
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const max = Math.max(r, g, b)
            const min = Math.min(r, g, b)
            if (max < 20) continue
            if (min > 235) continue
            const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        let bestKey: number | null = null
        let bestCount = 0
        for (const [k, c] of counts) {
            if (c > bestCount) {
                bestKey = k
                bestCount = c
            }
        }
        if (bestKey == null) return null
        const r = ((bestKey >> 8) & 0x0f) * 16 + 8
        const g = ((bestKey >> 4) & 0x0f) * 16 + 8
        const b = (bestKey & 0x0f) * 16 + 8
        return `rgb(${r}, ${g}, ${b})`
    } catch {
        return null
    }
}
