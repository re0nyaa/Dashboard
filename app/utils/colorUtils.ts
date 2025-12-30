// ---------- types ----------

type RGB = { r: number; g: number; b: number }

// ---------- color parsing ----------

function parseColorToRgb(color: string): RGB | null {
    const v = color.trim()

    // #rgb / #rrggbb / #rrggbbaa
    if (v.startsWith("#")) {
        let c = v.slice(1)

        if (c.length === 3) {
            c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]
        }

        if (c.length === 8) {
            c = c.slice(0, 6)
        }

        if (c.length !== 6) return null

        const num = parseInt(c, 16)
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255,
        }
    }

    // rgb() / rgba()
    const m = v.match(
        /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/
    )
    if (m) {
        return {
            r: Number(m[1]),
            g: Number(m[2]),
            b: Number(m[3]),
        }
    }

    return null
}

// ---------- luminance ----------

function srgbToLinear(c: number) {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function luminance({ r, g, b }: RGB) {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

// ---------- WCAG ----------

export function getContrastRatio(color1: string, color2: string): number {
    const rgb1 = parseColorToRgb(color1)
    const rgb2 = parseColorToRgb(color2)
    if (!rgb1 || !rgb2) return 1

    const l1 = luminance(rgb1)
    const l2 = luminance(rgb2)
    const [L1, L2] = l1 > l2 ? [l1, l2] : [l2, l1]

    return (L1 + 0.05) / (L2 + 0.05)
}

export function isWCAGAccessible(
    color1: string,
    color2: string,
    { level = "AA", largeText = false }: { level?: "AA" | "AAA"; largeText?: boolean } = {}
): boolean {
    const ratio = getContrastRatio(color1, color2)

    if (level === "AAA") {
        return largeText ? ratio >= 4.5 : ratio >= 7
    }
    return largeText ? ratio >= 3 : ratio >= 4.5
}

export function getReadableTextColor(
    bgColor: string,
    options?: { level?: "AA" | "AAA"; largeText?: boolean }
): "#ffffff" | "#000000" {
    const white = "#ffffff"
    const black = "#000000"

    const whiteRatio = getContrastRatio(bgColor, white)
    const blackRatio = getContrastRatio(bgColor, black)

    const whiteOK = isWCAGAccessible(bgColor, white, options)
    const blackOK = isWCAGAccessible(bgColor, black, options)

    if (whiteOK && !blackOK) return white
    if (blackOK && !whiteOK) return black

    return whiteRatio >= blackRatio ? white : black
}

// ---------- opacity ----------

export function applyOpacity(color: string, opacity: number): { rgba: string; hex8: string } {
    const rgb = parseColorToRgb(color)
    if (!rgb) {
        const a = Math.round(opacity * 255)
            .toString(16)
            .padStart(2, "0")
        return {
            rgba: `rgba(0, 0, 0, ${opacity})`,
            hex8: `#000000${a}`,
        }
    }

    const { r, g, b } = rgb
    const a = Math.round(opacity * 255)
    const alphaHex = a.toString(16).padStart(2, "0")

    return {
        rgba: `rgba(${r}, ${g}, ${b}, ${opacity})`,
        hex8: "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("") + alphaHex,
    }
}
