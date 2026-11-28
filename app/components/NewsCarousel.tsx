import { useEffect, useMemo, useRef, useState } from "react"
import { fetchNews, type NewsItem } from "../utils/rss"
import { AnimatePresence, motion } from "framer-motion"
import { toDataURL } from "qrcode"
import { isLightClockAppearance, useClockAppearance } from "./Clock"

const NEWS_CACHE_KEY = "dashboard.news.cache.v1"
const NEWS_TTL_MS = 5 * 60 * 1000

type NewsCache = {
    news: NewsItem[]
    currentIndex: number
    qrByLink: Record<string, string>
    fetchedAt: number
}

let memoryNewsCache: NewsCache | null = null

function loadNewsCache(): NewsCache {
    if (memoryNewsCache) return memoryNewsCache
    if (typeof window !== "undefined") {
        try {
            const raw = localStorage.getItem(NEWS_CACHE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<NewsCache>
                const cache: NewsCache = {
                    news: Array.isArray(parsed.news) ? parsed.news : [],
                    currentIndex: typeof parsed.currentIndex === "number" ? parsed.currentIndex : 0,
                    qrByLink: parsed.qrByLink && typeof parsed.qrByLink === "object" ? parsed.qrByLink : {},
                    fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
                }
                memoryNewsCache = cache
                return cache
            }
        } catch {
            // ignore storage errors
        }
    }
    return { news: [], currentIndex: 0, qrByLink: {}, fetchedAt: 0 }
}

function saveNewsCache(patch: Partial<NewsCache>) {
    const next: NewsCache = { ...loadNewsCache(), ...patch }
    memoryNewsCache = next
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(next))
    } catch {
        // ignore storage errors
    }
}

export function NewsCarousel() {
    const [news, setNews] = useState<NewsItem[]>(() => loadNewsCache().news)
    const [currentIndex, setCurrentIndex] = useState(() => {
        const c = loadNewsCache()
        return c.news.length > 0 ? Math.min(c.currentIndex, c.news.length - 1) : 0
    })
    const [direction, setDirection] = useState<1 | -1>(1)
    const [isLoading, setIsLoading] = useState(() => loadNewsCache().news.length === 0)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [atEndHint, setAtEndHint] = useState(false)
    const isLight = isLightClockAppearance(useClockAppearance())
    const isRefreshingRef = useRef(false)
    const endHintTimerRef = useRef<number | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const [qrByLink, setQrByLink] = useState<Record<string, string>>(
        () => loadNewsCache().qrByLink
    )

    const MAX_ITEMS = 5

    useEffect(() => {
        saveNewsCache({ currentIndex })
    }, [currentIndex])

    useEffect(() => {
        const c = loadNewsCache()
        if (c.news.length === 0 || Date.now() - c.fetchedAt >= NEWS_TTL_MS) {
            void loadNews(false)
        }
        // 5분마다 갱신
        const interval = setInterval(() => void loadNews(false), NEWS_TTL_MS)
        return () => clearInterval(interval)
    }, [])

    const loadNews = async (silent = false) => {
        if (silent) {
            if (isRefreshingRef.current) return
            isRefreshingRef.current = true
            setIsRefreshing(true)
        } else if (loadNewsCache().news.length === 0) {
            setIsLoading(true)
        }
        const [items] = await Promise.all([
            fetchNews(MAX_ITEMS, silent),
            silent ? new Promise((r) => setTimeout(r, 500)) : Promise.resolve(),
        ])
        const trimmed = items.slice(0, MAX_ITEMS)
        const now = Date.now()
        setNews((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(trimmed)) {
                saveNewsCache({ fetchedAt: now })
                return prev
            }
            saveNewsCache({ news: trimmed, currentIndex: 0, fetchedAt: now })
            setCurrentIndex(0)
            return trimmed
        })
        setIsLoading(false)
        setIsRefreshing(false)
        isRefreshingRef.current = false
    }

    const count = news.length

    const clearEndHint = () => {
        if (endHintTimerRef.current !== null) {
            window.clearTimeout(endHintTimerRef.current)
            endHintTimerRef.current = null
        }
        setAtEndHint(false)
    }

    const triggerEndHint = () => {
        clearEndHint()
        setAtEndHint(true)
        endHintTimerRef.current = window.setTimeout(() => {
            setAtEndHint(false)
            endHintTimerRef.current = null
        }, 1200)
    }

    const goNext = () => {
        if (count <= 0) return
        if (currentIndex >= count - 1) {
            triggerEndHint()
            return
        }
        clearEndHint()
        setDirection(1)
        setCurrentIndex((prev) => prev + 1)
    }

    const goPrev = () => {
        if (count <= 0) return
        clearEndHint()
        if (currentIndex === 0) {
            void loadNews(true)
            return
        }
        setDirection(-1)
        setCurrentIndex((prev) => prev - 1)
    }

    const currentNews = useMemo(() => {
        return news[currentIndex]
    }, [news, currentIndex])

    const currentQr = useMemo(() => {
        const link = currentNews?.link
        if (!link) return undefined
        return qrByLink[link]
    }, [currentNews?.link, qrByLink])

    useEffect(() => {
        const link = currentNews?.link
        if (!link) return
        if (qrByLink[link]) return

        let cancelled = false
        toDataURL(link, {
            margin: 1,
            width: 180,
        })
            .then((dataUrl: string) => {
                if (cancelled) return
                setQrByLink((prev) => {
                    const next = { ...prev, [link]: dataUrl }
                    saveNewsCache({ qrByLink: next })
                    return next
                })
            })
            .catch(() => {
                // 실패 무시 (실패 따위는 용납되지 않는다!)
            })

        return () => {
            cancelled = true
        }
    }, [currentNews?.link, qrByLink])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) > 10) {
                e.preventDefault()

                if (e.deltaY > 0) goNext()
                else goPrev()
            }
        }

        container.addEventListener("wheel", handleWheel, { passive: false })
        return () => container.removeEventListener("wheel", handleWheel)
    }, [count, currentIndex])

    if (isLoading) {
        return (
            <div className="w-full h-full bg-transparent flex items-center justify-center">
                <div
                    className={`text-lg font-medium ${
                        isLight ? "text-zinc-500" : "text-white/50"
                    }`}
                >
                    새로운 뉴스가 있는지 확인중이에요
                </div>
            </div>
        )
    }

    if (news.length === 0) {
        return (
            <div className="w-full h-full bg-transparent flex items-center justify-center">
                <div
                    className={`text-lg font-medium ${
                        isLight ? "text-zinc-500" : "text-white/50"
                    }`}
                >
                    뉴스를 불러올 수 없어요
                </div>
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-transparent overflow-hidden relative select-none"
        >
            <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                    key={currentNews.link}
                    custom={direction}
                    variants={{
                        enter: (dir: 1 | -1) => ({
                            y: dir === 1 ? 40 : -40,
                            opacity: 0,
                        }),
                        center: { y: 0, opacity: 1 },
                        exit: (dir: 1 | -1) => ({
                            y: dir === 1 ? -40 : 40,
                            opacity: 0,
                        }),
                    }}
                    initial="enter"
                    animate={atEndHint ? { y: "-20%", opacity: 1 } : "center"}
                    exit="exit"
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.18}
                    onDragEnd={(_, info) => {
                        const dy = info.offset.y
                        const SWIPE_THRESHOLD_PX = 60
                        if (dy >= SWIPE_THRESHOLD_PX) goPrev()
                        else if (dy <= -SWIPE_THRESHOLD_PX) goNext()
                    }}
                    className="relative h-full w-full max-w-[1440px] mx-auto px-6 sm:px-14 lg:px-20 py-14 sm:py-16 flex flex-col justify-between"
                >
                    {/* 상단 메타 바 */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <img
                                src="/sbs.svg"
                                alt="SBS 뉴스"
                                className="w-8 h-8 sm:w-10 sm:h-10"
                            />
                            <span
                                className={`text-xs sm:text-sm font-bold tracking-wider uppercase ${
                                    isLight ? "text-zinc-500" : "text-white/55"
                                }`}
                            >
                                주요 뉴스 · {currentIndex + 1} / {count}
                            </span>
                        </div>
                        <span
                            className={`text-xs sm:text-sm font-medium ${
                                isLight ? "text-zinc-400" : "text-white/45"
                            }`}
                        >
                            {new Date(currentNews.pubDate.toString()).toLocaleString("ko-KR", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </span>
                    </div>

                    {/* 중앙 에디토리얼 본문 + QR */}
                    <div className="my-auto py-6 flex flex-col lg:flex-row lg:items-end justify-between gap-8 lg:gap-14">
                        <div className="flex-1 min-w-0">
                            <h2
                                className={`text-[clamp(1.75rem,3.8vw,3.5rem)] font-black leading-[1.15] tracking-tight line-clamp-3 ${
                                    isLight ? "text-zinc-950" : "text-white"
                                }`}
                            >
                                {currentNews.title}
                            </h2>
                            <p
                                className={`mt-5 sm:mt-7 text-[clamp(1rem,1.65vw,1.45rem)] leading-[1.55] line-clamp-4 max-w-4xl ${
                                    isLight ? "text-zinc-600" : "text-white/70"
                                }`}
                            >
                                {currentNews.description}
                            </p>
                        </div>

                        <div
                            className={`shrink-0 self-start lg:self-end flex flex-row lg:flex-col items-center gap-3 bg-white rounded-3xl p-4 ${
                                isLight
                                    ? "shadow-[0_12px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
                                    : "shadow-2xl ring-1 ring-white/10"
                            }`}
                        >
                            <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 flex items-center justify-center">
                                {currentQr ? (
                                    <img
                                        src={currentQr}
                                        alt="QR"
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="text-zinc-400 text-xs">QR 생성중</div>
                                )}
                            </div>
                            <span className="text-xs font-semibold text-zinc-600">
                                모바일로 원문 보기
                            </span>
                        </div>
                    </div>

                    {/* 하단 기사 전환 도트 */}
                    <div className="flex items-center gap-2 pb-4">
                        {news.map((item, idx) => (
                            <button
                                key={item.link}
                                type="button"
                                onClick={() => {
                                    setDirection(idx > currentIndex ? 1 : -1)
                                    setCurrentIndex(idx)
                                }}
                                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                    idx === currentIndex
                                        ? isLight
                                            ? "w-8 bg-zinc-900"
                                            : "w-8 bg-white"
                                        : isLight
                                          ? "w-2 bg-zinc-300"
                                          : "w-2 bg-white/25"
                                }`}
                            />
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            <AnimatePresence>
                {atEndHint ? (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.2 }}
                        className={`absolute bottom-0 inset-x-0 h-[20%] z-20 flex items-center justify-center text-xl sm:text-2xl font-bold pointer-events-none ${
                            isLight ? "text-zinc-500" : "text-white/55"
                        }`}
                    >
                        마지막 뉴스에요
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {isRefreshing ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center pointer-events-none"
                    >
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-[3px] border-white/25 border-t-white animate-spin" />
                            <div className="text-white text-2xl sm:text-3xl font-bold tracking-tight">
                                새로운 뉴스가 있는지 확인중이에요
                            </div>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}
