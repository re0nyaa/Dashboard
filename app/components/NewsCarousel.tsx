import { useEffect, useMemo, useRef, useState } from "react"
import { fetchNews, type NewsItem } from "../utils/rss"
import { AnimatePresence, motion } from "framer-motion"
import { toDataURL } from "qrcode"
import { data } from "react-router"

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
            <div className="w-[860px] h-[440px] bg-[#4b4b4b] rounded-[30px] flex items-center justify-center">
                <div className="text-white/60 text-lg">뉴스 로딩 중...</div>
            </div>
        )
    }

    if (news.length === 0) {
        return (
            <div className="w-[860px] h-[440px] bg-[#4b4b4b] rounded-[30px] flex items-center justify-center">
                <div className="text-white/60 text-lg">뉴스를 불러올 수 없습니다</div>
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className="w-[860px] h-[440px] rounded-[60px] overflow-hidden relative select-none"
        >
            <div className="absolute inset-0 bg-gradient-to-b from-white to-zinc-100" />
            <div className="absolute inset-0 shadow-2xl" />

            <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                    key={currentNews.link}
                    custom={direction}
                    variants={{
                        enter: (dir: 1 | -1) => ({
                            y: dir === 1 ? -24 : 24,
                            opacity: 0,
                        }),
                        center: { y: 0, opacity: 1 },
                        exit: (dir: 1 | -1) => ({
                            y: dir === 1 ? 24 : -24,
                            opacity: 0,
                        }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info) => {
                        const dy = info.offset.y
                        const SWIPE_THRESHOLD_PX = 80
                        if (dy >= SWIPE_THRESHOLD_PX) goNext()
                        else if (dy <= -SWIPE_THRESHOLD_PX) goPrev()
                    }}
                    className="relative h-full w-full px-[72px] py-[56px]"
                >
                    <div className="absolute right-[30px] top-[30px]">
                        <img src="/sbs.svg" alt="연합뉴스" className="w-[50px] h-[50px]" />
                    </div>

                    <h2 className="mt-[40px] text-black text-[40px] font-black leading-[1.08] tracking-tight line-clamp-2">
                        {currentNews.title}
                    </h2>

                    <p className="mt-[30px] text-zinc-800 text-[30px] leading-[1.18] line-clamp-3 pr-[230px]">
                        {currentNews.description}
                    </p>

                    <p className="mt-[30px] text-gray-500 text-[20px]">
                        {new Date(currentNews.pubDate.toString()).toLocaleString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </p>
                    <div className="absolute right-[56px] bottom-[44px] w-[170px] h-[170px] rounded-[18px] bg-white flex items-center justify-center">
                        {currentQr ? (
                            <img src={currentQr} alt="QR" className="w-[120px] h-[1200px]" />
                        ) : (
                            <div className="text-zinc-500 text-sm">QR 생성중</div>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
