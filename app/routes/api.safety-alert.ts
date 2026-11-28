import dotenv from "dotenv"

export type SafetyAlertApiItem = {
    id: string
    level: "긴급재난문자" | "안전안내문자" | "위급재난문자"
    sender: string
    message: string
    receivedAt: string
    timestamp: number
    region: string
}

function todayYyyymmddKst(): string {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return now.toISOString().slice(0, 10).replace(/-/g, "")
}

function normalizeLevel(raw?: string): SafetyAlertApiItem["level"] {
    if (raw === "위급재난문자") return "위급재난문자"
    if (raw === "긴급재난문자") return "긴급재난문자"
    return "안전안내문자"
}

function parseKstTimestamp(crtDt?: string): number {
    if (!crtDt) return 0
    const normalized = crtDt.trim().replace(/\//g, "-").replace(" ", "T")
    const dt = new Date(`${normalized}+09:00`)
    return Number.isFinite(dt.getTime()) ? dt.getTime() : 0
}

function formatTimeLabel(crtDt?: string): string {
    const ts = parseKstTimestamp(crtDt)
    if (!ts) return ""
    return new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul",
    }).format(new Date(ts))
}

function isMissingPersonAlert(item: any): boolean {
    const dst = String(item?.DST_SE_NM ?? "")
    const msg = String(item?.MSG_CN ?? "")
    return (
        dst.includes("실종") ||
        msg.includes("실종") ||
        msg.includes("배회") ||
        msg.includes("찾습니다")
    )
}

function matchesRegion(rcptnRgn: string, regionQuery: string): boolean {
    if (!regionQuery) return true
    if (rcptnRgn.includes("전국") || rcptnRgn.includes("전체")) {
        // '경기도 전체' 같은 도 전체는 해당 도가 포함된 경우만 허용
        if (rcptnRgn.includes("전국") || rcptnRgn === "전체") return true
    }
    const tokens = regionQuery
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    if (tokens.length === 0) return true

    // 시/군/구/동 등 하위 행정구역 토큰이 있으면 해당 토큰 우선 매칭 (타 시/군 오탐 방지)
    const subTokens = tokens.filter((t) => !t.endsWith("도") && !t.endsWith("특별시") && !t.endsWith("광역시"))
    if (subTokens.length > 0) {
        if (subTokens.some((t) => rcptnRgn.includes(t))) return true
        // 도 단위 전체 발송('경기도 전체')인 경우 허용
        const sidoTokens = tokens.filter((t) => t.endsWith("도") || t.endsWith("특별시") || t.endsWith("광역시"))
        return sidoTokens.some((sido) => rcptnRgn.includes(`${sido} 전체`))
    }

    return tokens.some((t) => rcptnRgn.includes(t))
}

export async function loader({ request }: { request: Request }) {
    if (!process.env.SAFETY_ALERT_API_KEY) {
        dotenv.config({ override: true })
    }
    const apiKey = process.env.SAFETY_ALERT_API_KEY
    if (!apiKey) {
        return Response.json({ alerts: [] }, { headers: { "cache-control": "no-store" } })
    }

    const url = new URL(request.url)
    const region = url.searchParams.get("region")?.trim() ?? ""
    const latestMode = url.searchParams.get("latest") === "1"

    const fetchFromApi = async (crtDt?: string) => {
        const apiUrl = new URL("https://www.safetydata.go.kr/V2/api/DSSP-IF-00247")
        apiUrl.searchParams.set("serviceKey", apiKey)
        apiUrl.searchParams.set("returnType", "json")
        apiUrl.searchParams.set("pageNo", "1")
        apiUrl.searchParams.set("numOfRows", "15")
        if (crtDt) apiUrl.searchParams.set("crtDt", crtDt)

        const res = await fetch(apiUrl.toString(), { signal: controller.signal })
        if (!res.ok) return []
        const json = (await res.json()) as { body?: any[] }
        return Array.isArray(json?.body) ? json.body : []
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
        let rawList = await fetchFromApi(todayYyyymmddKst())
        let filtered = rawList
            .filter((item) => item?.MSG_CN && item?.SN != null && !isMissingPersonAlert(item))
            .filter((item) => matchesRegion(String(item.RCPTN_RGN_NM ?? ""), region))

        if (latestMode && filtered.length === 0) {
            rawList = await fetchFromApi(undefined)
            filtered = rawList
                .filter((item) => item?.MSG_CN && item?.SN != null && !isMissingPersonAlert(item))
                .filter((item) => matchesRegion(String(item.RCPTN_RGN_NM ?? ""), region))
            if (filtered.length === 0) {
                filtered = rawList.filter(
                    (item) => item?.MSG_CN && item?.SN != null && !isMissingPersonAlert(item)
                )
            }
        }

        const alerts: SafetyAlertApiItem[] = filtered
            .map((item) => {
                const regionText = String(item.RCPTN_RGN_NM ?? "").trim()
                const dstType = String(item.DST_SE_NM ?? "").trim()
                return {
                    id: String(item.SN),
                    level: normalizeLevel(item.EMRG_STEP_NM),
                    sender: dstType ? `${regionText || "행정안전부"} · ${dstType}` : regionText || "행정안전부",
                    message: String(item.MSG_CN).trim(),
                    receivedAt: formatTimeLabel(item.CRT_DT),
                    timestamp: parseKstTimestamp(item.CRT_DT),
                    region: regionText,
                }
            })
            .sort((a, b) => b.timestamp - a.timestamp)

        return Response.json({ alerts }, { headers: { "cache-control": "no-store" } })
    } catch {
        return Response.json({ alerts: [] }, { headers: { "cache-control": "no-store" } })
    } finally {
        clearTimeout(timeout)
    }
}
