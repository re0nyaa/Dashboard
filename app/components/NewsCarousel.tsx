import { useEffect, useMemo, useRef, useState } from "react"
import { fetchNews, type NewsItem } from "../utils/rss"
import { AnimatePresence, motion } from "framer-motion"
import { toDataURL } from "qrcode"

export function NewsCarousel() {
    const [news, setNews] = useState<NewsItem[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [direction, setDirection] = useState<1 | -1>(1)
    const [isLoading, setIsLoading] = useState(true)
    const containerRef = useRef<HTMLDivElement>(null)

    const [qrByLink, setQrByLink] = useState<Record<string, string>>({})

    const MAX_ITEMS = 5

    useEffect(() => {
        loadNews()
        // 5분마다 갱신
        const interval = setInterval(loadNews, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    const loadNews = async () => {
        setIsLoading(true)
        const items = await fetchNews(MAX_ITEMS)
        const trimmed = items.slice(0, MAX_ITEMS)
        setNews(trimmed)
        setCurrentIndex(0)
        setIsLoading(false)
    }

    const count = news.length

    const goNext = () => {
        if (count <= 0) return
        setDirection(1)
        setCurrentIndex((prev) => (prev + 1) % count)
    }

    const goPrev = () => {
        if (count <= 0) return
        setDirection(-1)
        setCurrentIndex((prev) => (prev - 1 + count) % count)
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
                setQrByLink((prev) => ({ ...prev, [link]: dataUrl }))
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
            <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center">
                <div className="text-white/50 text-lg font-medium">뉴스 로딩 중...</div>
            </div>
        )
    }

    if (news.length === 0) {
        return (
            <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center">
                <div className="text-white/50 text-lg font-medium">뉴스를 불러올 수 없습니다</div>
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-gradient-to-br from-zinc-50 via-white to-zinc-100 overflow-hidden relative select-none"
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
                    animate="center"
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
                            <span className="text-xs sm:text-sm font-bold tracking-wider uppercase text-zinc-500">
                                주요 뉴스 · {currentIndex + 1} / {count}
                            </span>
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-zinc-400">
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
                            <h2 className="text-zinc-950 text-[clamp(1.75rem,3.8vw,3.5rem)] font-black leading-[1.15] tracking-tight line-clamp-3">
                                {currentNews.title}
                            </h2>
                            <p className="mt-5 sm:mt-7 text-zinc-600 text-[clamp(1rem,1.65vw,1.45rem)] leading-[1.55] line-clamp-4 max-w-4xl">
                                {currentNews.description}
                            </p>
                        </div>

                        <div className="shrink-0 self-start lg:self-end flex flex-row lg:flex-col items-center gap-3 bg-white rounded-3xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
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
                            <span className="text-xs font-semibold text-zinc-500">
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
                                    idx === currentIndex ? "w-8 bg-zinc-900" : "w-2 bg-zinc-300"
                                }`}
                            />
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
